'use strict';

const ATOB = require('atob');
const AWS = require('aws-sdk');
const Boom = require('@hapi/boom');
const { PDFDict, PDFDocument, PDFName, StandardFonts } = require('pdf-lib');
const Fs = require('fs');
const Handlebars = require('handlebars');
const Lob = require('lob')(process.env.LOB_SECRET);
const Path = require('path');
const Puppeteer = require('puppeteer');
const { promisify } = require('util');
const Moment = require('moment');
const Schmervice = require('schmervice');
const Util = require('util');
const { v4: Uuid } = require('uuid');

const COMPLETED = __dirname + '/../filled/';
const THIRTY_TWO_MINUTES = 1920;

const ELIGIBLE_ZIPS = ['46235','46231','46077','46222','46113','46201','46226','46256','46254','46216',
    '46222','46224','46234','46237','46183','46219','46236','46225','46221','46236','46240','46107',
    '46278','46229','46260','46203','46202','46259','46205','46206','46260','46217','46241','46250',
    '46208','46229','46235','46218','46227','46214','46268','46239','46228','46220','46204'
];

const ReadFile = Util.promisify(Fs.readFile);
const WriteFile = Util.promisify(Fs.writeFile);
const Unlink = Util.promisify(Fs.unlink);

module.exports = class DeclarationService extends Schmervice.Service {

    convertDataURIToBinary(dataURI) {

        const BASE64_MARKER = ';base64,';
        const base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
        const base64 = dataURI.substring(base64Index);
        const raw = ATOB(base64);
        const rawLength = raw.length;
        const array = new Uint8Array(new ArrayBuffer(rawLength));

        for (let i = 0; i < rawLength; ++i) {
            array[i] = raw.charCodeAt(i);
        }

        return array;
    }

    async generate(variables) {

        const { tenant, landlord, date } = variables;
        const { emailService } = this.server.services();

        variables.formattedDate = Moment(date).format('MM/DD/YYYY');
        tenant.name = `${tenant.firstName} ${tenant.lastName}`;

        const declaration = await this.fillPdf(variables);
        console.log(variables.formattedDate);
        const cover = await this.fillCover({ tenant, landlord, formattedDate: variables.formattedDate });

        const output = await PDFDocument.load(Fs.readFileSync(COMPLETED + cover));
        const pages = await output.copyPages(declaration, [0, 1]);

        output.addPage(pages[0]);
        output.addPage(pages[1]);

        const pdfBytes = await output.save();

        Fs.writeFileSync(COMPLETED + cover, pdfBytes);

        const s3 = new AWS.S3();
        const declarationContent = Fs.readFileSync(COMPLETED + cover);

        const params = {
            Bucket: this.options.s3Bucket,
            Key: cover,
            Body: declarationContent
        };
        await s3.upload(params).promise();

        await Unlink(COMPLETED + cover);

        const signParams = {
            Bucket: this.options.s3Bucket,
            Key: cover,
            Expires: THIRTY_TWO_MINUTES
        };

        if (variables.tenant && (variables.tenant.gender || variables.tenant.race)) {
            const { gender, race, zip } = variables.tenant;
            const { Demographics } = this.server.models();
            await Demographics.query().insert({ race, gender, zip });
        }

        const signedUrl = s3.getSignedUrl('getObject', signParams);

        if (variables.snail === true && ELIGIBLE_ZIPS.includes(variables.landlord.zip)) {
            await this.mailDeclaration({ signedUrl, variables });
        }

        if (variables.sendEmail === true) {
            console.log({ variables });
            await emailService.sendWithForm({
                email: variables.landlord.email,
                variables,
                signedUrl,
                template: 'declaration'
            });
        }

        return signedUrl;

    }

    async fillPdf(variables) {

        const blank = Path.resolve(__dirname, '..', 'forms/declaration_d508.pdf');

        const pdfDoc = await PDFDocument.load(Fs.readFileSync(blank));

        const { tryingToPay, governmentAsst, income, affordRentProblems, evictionHealthRisks } = variables.answers;
        const form = pdfDoc.getForm();

        //This is all super-hardcoded.  If the form changes or the order of the
        //questions in the FE change, this all needs to be re-done.
        //Note for future explorers - the whitespace in the checkbox names is tricky
        if (income.includes('0')) {
            form.getCheckBox('Column A  2').check();
        }

        if (income.includes('1')) {
            form.getCheckBox('Column A ').check();
        }

        if (income.includes('2')) {
            form.getCheckBox('Column A  3').check();
        }

        if (affordRentProblems.includes('0')) {
            form.getCheckBox('Column B').check();
        }

        if (affordRentProblems.includes('1')) {
            form.getCheckBox('Column B 2').check();
        }

        if (affordRentProblems.includes('2') || affordRentProblems.includes('3')) {
            form.getCheckBox('Column B 3').check();
        }

        if (affordRentProblems.includes('4')) {
            form.getCheckBox('Column B 4').check();
        }

        //this should always be true, but just in case
        if (income && income.length > 0) {
            form.getCheckBox('Declare').check();
        }

        if (evictionHealthRisks && evictionHealthRisks.length > 0) {
            form.getCheckBox('Declare 3').check();
        }

        if (evictionHealthRisks && evictionHealthRisks.length > 0) {
            form.getCheckBox('Declare 3').check();
        }

        if (tryingToPay === 'Yes' && governmentAsst === 'Yes') {
            form.getCheckBox('Declare 2').check();
        }

        form.getCheckBox('Declare 4').check();
        form.flatten();

        const pages = pdfDoc.getPages();

        //We only need page 2, since that has the sig and date fields
        const page = pages[1];

        const y = 322;
        if (variables.signature) {
            const signature = this.convertDataURIToBinary(variables.signature);

            //we have to embed the image, then draw it onto the page, because pdf
            const pngImage = await pdfDoc.embedPng(signature);
            const sigWidth = pngImage.width;
            const sigHeight = pngImage.height;

            const scaling = 35 / sigHeight;

            //this is in points in the Acrobat UI
            //these magical numbers were pulled from the underlying PDF by hand.
            //Updates to that file will have to replicate that process and update here.
            page.drawImage(pngImage, {
                x: 100,
                y,
                width: sigWidth * scaling,
                height: sigHeight * scaling
            });
        }

        if (variables.formattedDate) {
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

            page.drawText(variables.formattedDate, {
                x: 465,
                y,
                size: 14,
                font: helveticaFont
            });
        }

        return pdfDoc;
    }

    async sign(variables) {

        const blank = Path.resolve(__dirname, '..', 'forms/declaration.pdf');

        const pdfDoc = await PDFDocument.load(Fs.readFileSync(blank));

        const pages = pdfDoc.getPages();

        const page = pages[0];

        const y = 170;

        if (variables.signature) {
            const signature = this.convertDataURIToBinary(variables.signature);

            //we have to embed the image, then draw it onto the page, because pdf
            const pngImage = await pdfDoc.embedPng(signature);
            const sigWidth = pngImage.width;
            const sigHeight = pngImage.height;

            const scaling = 35 / sigHeight;

            //this is in points in the Acrobat UI
            //these magical numbers were pulled from the underlying PDF by hand.
            //Updates to that file will have to replicate that process and update here.
            page.drawImage(pngImage, {
                x: 140,
                y,
                width: sigWidth * scaling,
                height: sigHeight * scaling
            });
        }

        if (variables.formattedDate) {
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

            page.drawText(variables.formattedDate, {
                x: 493,
                y,
                size: 14,
                font: helveticaFont
            });
        }

        return pdfDoc;
    }

    async fillCover(variables) {

        try {

            const coverLetterPath = Path.resolve(__dirname, '..', 'templates/cover-letter/letter.html');
            const content = await ReadFile(coverLetterPath, 'utf8');
            const template = Handlebars.compile(content);
            const result = template(variables);
            const filledId = Uuid();
            const filledName = `cover-${filledId}.pdf`;
            const destination = COMPLETED + filledName;

            const options = {
                format: 'Letter',
                headerTemplate: '<p></p>',
                footerTemplate: '<p></p>',
                displayHeaderFooter: false,
                margin: {
                    top: '40px',
                    bottom: '100px'
                },
                printBackground: true,
                path: destination
            };

            const browser = await Puppeteer.launch({
                args: ['--no-sandbox'],
                headless: true
            });
            //random filename for temp file to prevent collisons
            const htmlId = Uuid();
            const htmlFile = Path.join(__dirname, `temp-${htmlId}.html`);
            await WriteFile(htmlFile, result);
            const page = await browser.newPage();
            await page.goto(`file:${htmlFile}`);
            await page.pdf(options);
            await browser.close();
            //clean up temp file, we don't need it anymore
            await Unlink(htmlFile);
            return filledName;
        }
        catch (error) {
            throw new Boom.Boom('Cannot handle the form template content.');
        }
    }

    async mailDeclaration({ signedUrl, variables }) {

        const createLetter = promisify(Lob.letters.create.bind(Lob.letters));


        await createLetter({
            description: 'Eviction Declaration',
            to: {
                name: variables.landlord.name,
                address_line1: variables.landlord.address,
                address_line2: variables.landlord.address2,
                address_city: variables.landlord.city,
                address_state: variables.landlord.state,
                address_zip: variables.landlord.zip
            },
            from: {
                name: variables.tenant.name,
                address_line1: variables.tenant.address,
                address_line2: variables.tenant.address2,
                address_city: variables.tenant.city,
                address_state: variables.tenant.state,
                address_zip: variables.tenant.zip
            },
            file: signedUrl,
            address_placement: 'insert_blank_page',
            color: false
        });

        return;
    }
};
