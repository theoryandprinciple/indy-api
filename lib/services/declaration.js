'use strict';

const ATOB = require('atob');
const AWS = require('aws-sdk');
const Boom = require('@hapi/boom');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const Fs = require('fs');
const Handlebars = require('handlebars');
const Path = require('path');
const Puppeteer = require('puppeteer');
const Moment = require('moment');
const Schmervice = require('schmervice');
const Util = require('util');
const { v4: Uuid } = require('uuid');

const COMPLETED = __dirname + '/../filled/';
const THIRTY_TWO_MINUTES = 1920;

const ReadFile = Util.promisify(Fs.readFile);

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

        const { tenant, landlord, signature, date } = variables;
        const formattedDate = Moment(date).format('MM/DD/YYYY');
        tenant.name = `${tenant.firstName} ${tenant.lastName}`;
        const declaration = await this.sign({ signature, formattedDate });

        const cover = await this.fillCover({ tenant, landlord, formattedDate });
        const output = await PDFDocument.load(Fs.readFileSync(COMPLETED + cover));
        const pages = await output.copyPages(declaration, [0,1]);

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

        const unlink = Util.promisify(Fs.unlink);
        await unlink(COMPLETED + cover);

        const signParams = {
            Bucket: this.options.s3Bucket,
            Key: cover,
            Expires: THIRTY_TWO_MINUTES
        };

        if (variables.tenant && (variables.tenant.gender || variables.tenant.race)) {
            const { gender, race } = variables.tenant;
            const { Demographics } = this.server.models();
            await Demographics.query().insert({ race, gender });
        }

        return s3.getSignedUrl('getObject', signParams);

    }

    async sign(variables, trx) {
        //test signature:
        //signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmIAAACWCAYAAAB9yuTAAAAV+ElEQVR4Xu3dW6g9UV0H8J/RDYksMnoQtTKIsDBBiCK0qJfAMAnM6qE7QVBmBIEJFQXZS+VDIBWZRFQQWSAR9ND9MawQscjsQr2Ull1IKiy+MStX4z7n7LP37LNm7f3ZcPhfzuxZM59Ze/Z31lqz5hnlRYAAAQIECBAgMETgGUNKVSgBAgQIECBAgEAJYioBAQIECBAgQGCQgCA2CF6xBAgQIECAAAFBTB0gQIAAAQIECAwSEMQGwSuWAAECBAgQICCIqQMECBAgQIAAgUECgtggeMUSIECAAAECBAQxdYAAAQIECBAgMEhAEBsEr1gCBAgQIECAgCCmDhAgQIAAAQIEBgkIYoPgFUuAAAECBAgQEMTUAQIECBAgQIDAIAFBbBC8YgkQIECAAAECgpg6QIAAAQIECBAYJCCIDYJXLAECBAgQIEBAEFMHCBAgQIAAAQKDBASxQfCKJUCAAAECBAgIYuoAAQIECBAgQGCQgCA2CF6xBAgQIECAAAFBTB0gQIAAAQIECAwSEMQGwSuWAAECBAgQICCIqQMECBAgQIAAgUECgtggeMUSIECAAAECBAQxdYAAAQIECBAgMEhAEBsEr1gCBAgQIECAgCCmDhAgQIAAAQIEBgkIYoPgFUuAAAECBAgQEMTUAQIECBAgQIDAIAFBbBC8YgkQIECAAAECgpg6QIAAAQIECBAYJCCIDYJXLAECBAgQIEBAEFMHCBAgQIAAAQKDBASxQfCKJUCAAAECBAgIYuoAAQIECBAgQGCQgCA2CF6xBAgQIECAAAFBTB0gQIAAAQIECAwSEMQGwSuWAAECBAgQICCIqQMECBAgQIAAgUECgtggeMUSIECAAAECBAQxdYAAAQIECBAgMEhAEBsEr1gCBAgQIECAgCCmDhAgQIAAAQIEBgkIYoPgFUuAAAECBAgQEMTUAQIECBAgQIDAIAFBbBC8YgkQIECAAAECgpg6QIAAAQIECBAYJCCIDYJXLAECBM4U+NSqekVVfcWynn+qqpdU1Qer6jVV9atnrt/bCRB4AgFB7AmQFUGAAIENBRK8ErS+6J51vrGqvnPDMq2KAIELCQhiF4K1WgIECGwg8LKq+tyqSuvXS6vq46vqM5b1/nFV/WxV/XZVfXtVfePy//9eVV9QVX+0QflWQYDAhQUEsQsDWz0BAgSOEEjYSuhK4Mrf8/MJB973gar6kSWA/eXy+7znPd2yLxbCjhC3CIGdCFxTEHt+Vf3VTlxtBgECBO4SaK1cLXDlz/tev7YEq7R85Wf9Shfkjy3/+QNV9f3oCRCYR+BagtjblyvINMk/cx5+W0qAwA0IJHhlPFf7eWiXf2cZaJ+uxUPBa/3+LPeiqnr/Ha1oD5Xn9wQIDBS4liCW5vqPWRyvZZ8GVgtFEyBwhsBjg1fGeuUOx7tavO7blIS731oWSMtZu4PyjM33VgIEnlLgGkJLPz7i76rqOU8JqCwCBG5eoI3vSgi6707GBpUhFH3wyrQTp7xy7ktvQBtL9g3L2LFT1uU9BAgMEriGIPb1VfXmxe8tVZV/exEgQOBSAglemb8rfx7TApUuwz54tUH252xfwldawtr4spSRYHZqqDtnW7yXAIEzBK4hiLXxEWEwUPWMyuCtBAgcFEjoSXfjd1fV51XVRx3hlG7C1tV4iWkkEuwSBttLa9gRB8UiBPYoMHsQe3VV/UIHK4jtsZbZJgLzCSR8tVnrj2n1ygD7FryOGWB/qki2Kz0A/TYZG3aqpvcR2IHA7EHsfVX1iZ2j2aR3UKlsAoGJBdK9931L0Dk0j1fbtQSvtHS1Lsen2OVsT8pL61x7ZbxZuid1ST7FEVAGgQsIzBzE1pMYhudnquqbLuBklQQIXLdAzid5bNB9jwVK+HpbVf30oODTj4fN0ci4sISwLcacXffRtXcEdiwwcxBbn5TCbEbpHVc2m0ZghwJpZUoAe11VffSB7UuL048vLVGjA08eZ/R13TZ+8ZHzjO2Q3SYRINAEZg5i65OSyQzVawIEHiOQi7nMSH+oCzJze2WG+nQF7uWVIJgniORlXNhejortIHCmwMxBLANi+7ESTkxnVgZvJ3AjAgleGQd2qBvyH6rqW3YWwNph+e/u+Jiq50Yqq928foGZg1h/UsqRcvv29ddXe0jgXIGEsN+tqs9ZrSjBJi1go7sf79u/DMh/VrdAAmPGq3kRIDCxwKxBLCfTf1y55+5Jdw5NXBltOoELC+S88dbV7PfpgkzL2CWnnNhqt9bDMbLe/F8uQr0IEJhUYNYg1j9fLfTvrapnT3oMbDYBApcXyF2RCWFtJvqU+JtV9aqJLuAO3Sme/UiIzMB9LwIEJhSYNYilCyFjPNrLRK6Xq3wJvekO6b/A0n2TMXlaIC/nbs3bCaTuJoQlyLTXrEMZ3lBV33OAJnOaJYz5TG5Xb6yJwJMIzBrE1gP13cZ9fnVJt01ujc+XVb648mf/xXWohNxRlp/Mr7TnsTXn61jDrAKpw3kmY6vLmY4is9Jf4rFDT2V0aOqelJ0Q9qblaSN/8lQboxwCBM4TmDWIrQetzrof5x29bd/99lWr12PX/q9V9c6q+tbJv+Qeu9+W37fAn1fVC5ZNzAVDQtg1tBqlpToXQf3g/f5IJGhm/Fharl0k7buO2robF5gxwKwH6ucK96GWmxs/zPfufuwyl9L6eXpxzQk8J/R8cbU/s3y6htt8RuuVm0ZEbduLQP9g7HdX1UuuJIQ137RcZx/v+iy25RLIMnxDINtLzbQdBDqBGYPYeqC++XROr9I5kafbpk1omS+r762qXzpilekeORTIchdaP57siFVZhMDmAv0dhn+4hLDNC9nJCvM5zOfxvkCWi6kM4Zi5S3Yn3DaDwLYCMwax9UD91y6PINlW5jbW1sbapRUrrqecpH++qr6m45p1EPRtHPHr38tcVKSFN8Ekr1tqoc258Cur6nlV9dwDhzotYnkM3DV0zV5/TbaHNyMwYxDruxtyoAzUP626vr6qfnAZaJ9WxlNf6xsnzOd2qqT3nSuQltg3dy2yb3zgId7nlrfn9+cznWdkvmi1ke6u3PNRs203KTBjEFt/8c+4DyMrWz+p5Qeq6svOnMxyfTw8eH3k0b3dsjMpa6a0Sf3O+Ma0iM0wSeulj9ihSWBzA0NaztxZeWl96ydwhMCMIaa/Y9J4pCMOcrdIP5/SFl9WGbifuy37hyZ/mkHBjzsolj5LYN0VmTGjCWW63z7EeiiMva+qPukseW8mQGATgRmDWP+MyVvuenhsBUg3xWuWN2XcTFoMzvmyyhdgBvr3A/MF48ceFcufI5ALgd+vqudU1fuXOp2hC14fLpC7on+uqj6u+9WM53/HlsDVCcz2QVxPXfHK5fbtqzswG+7QelbxrZ5CcOgq20D9DQ+cVd0rkAuJDMrPOeEvqupLtMQ+WGNevUz22hac7fz/4A5agMCMArN9EBMq0hXWXrrB7q91/biZtBjkqniLcTOZvTsTt/avTJZ5zqD/GT8/tvnpBRK8MiA/dTl1OnU8FwVeDwusz59urHnYzBIELi4wWxDr5xDLSbgfm3RxrIkKSJdNvqxaMEqXYf5+Tldk2/319CH5/4w3y0l+i/VPxGxTn1Agn/V0rSd45e8ZlpC6qM497iD0Qzu0YD/OztIELiIwWxDrn7FmItfDVeKSD0RfT6abLfi3qnr5Ri1tF6nkVjq1QFq+XrG0gOV8ldYvAez0Q9pP/5MQm7uczbh/uqd3EjhbYLYg9otV9VXLXr+uqn74bIHrWUFCUlrB+ocbb30L/3qqiuh9eVW97XoY7ckOBFKH8wD61N90n7WHyxuIf/7BWV9MbTVm9PwtswYCNyowWxDrxyZ9dVUlmN36K19amT+pzSQej0t026Sc96ywncRvvfZtt/+t1esLq+pTqupXllZW47+2M25r6i+o0hqWsbZeBAgMEpgtiPUnkFsfaLoeM5MqlLFgGUOzxYD8dZXMenOXWnt52PqgD+2VFJv6m/CVFpp0P+ZclHqb4KXl67IHOd5v7Yq49XPpZbWtncADArMFsTyeoz2yY7Zt37Iyrrshc+NC5gnL2JlLvdbTVRjoeynp611vWlX78JV6q9vx6Y/3unvSY+Ke/hgokcD/CcwWZtodP7c6cej6bsgcyC0mZz3mI/GOqnpht6CpQ45Rs8zLlhavfPnnztq0pCZ8pfVLy9eY+rGeT8w4zzHHQakE/ldgpiDWT+Z6i3NW9TPj59hdshvy0Mfjg119+Zuqep7PEIEDAusux/w7dbW1fKVV22uswLdV1U90m6B1e+zxUPqNC8wUxPrm9FsKYhnPkbFZ7W7Ip+iGXH8s1gP10wqX7fIiEIG0erWxXu2RV6kjreXL9Aj7qifrz7MB+/s6PrbmxgRmDWJ/UFW5u+qaX4e6IS9xN+QxhsaUHKN0O8skbLXwlbqRVq90ObbuRl2O+68L6zGfr13Gme5/y20hgSsTmCmIfXNV/dTin2fLveDKjkXbnQSwH6qqr+3276m7Ide0gtiVVrYjdyuhK+Er9aAFr7w1rV4JX/nR5Xgk5k4WWz/uKJO7ZtynJxXs5ADZjNsRmCmI9dMnXONg/UPzgWXW+tfv4Ep1fbu7u6yu9xyRepg7k9vg+v75oRkSkNauhK5LTJFyvar73LN1q1ha3HOe9boOgbRUJ3A/f/kzf8/nN8fZa0cCMwWx/tE91zSR6KEAliqSWfK/aydXqILYjj60G25KTtQtdLXg1Z7f2roaW+jS4rUh/E5WdWiSZgP3d3JwTtyMfH7zVIo3VNXH3rEOd7yfiHupt80UxPpnpF1DEMsXX3uMS3980+qQWfL3NMB5fcK+Bv9Lfab2ut4+dOXKOD/tBpBsc+pd62LMn7qo9nokt92udatY1i6MbWt8ybXlc70eOvBQeSbwfUjoiX8/UxDrZ9WfOQgkZCWA9V0+Oexpgdj62ZBbVqd+Mt1bumt1S8OnXFc7ObfQ1e5mbKGrtXQl8Gvtesojs6+y8kWec2ubKLttXQJaBvAL5Ps6XtmafJZfVVWfdcfd6zk/Z7qhP6uq31iOYeumbEML9rdXN7xFswaxV042GWT/EOO+FaIFsHS77v2ZeutHHGU/Eh69xgsk1OeLVOgafyxm3ILUm4SxZ602PiEs40EF9bFHtd2h3G6YacMH/nl5VFWOXS6ojNsce5xOLn3WIDbDYPH2OJe0cvWtEe1gJcQkgOUKZYarznX35FtWDxo/uRJ649ECrXuxdSt+aVV9dvfu3MTSuhfz5ekL9Gjam18wdSsXg3kE1fqV81R6IbwuK9APH8j5tl1YtVLz+W6fa3cqX/ZYPOnaBbFtuR8KXyktH6bMkr/3FrBDMu9cmsPb717sy37bCrSsLfWo3enUn5DblXAWS/fDf1TVr7uL8SLH4FZXmgvHnJ/WrWPvqqo3LfVOwD+9diRcxTaf6/4n/99/vnOh3oeutHjtadzw6QLe+WECgtj5lSIfnjwu5POXeXgOrbE9Xy/ha+aT2Hruoezrf1bVe6sqJ+q8+hNGWvr6/c1TAWbe//Nry/9fQzspt7m5WtdDv5QT8tbq1veQQM5paalPl9ihVz7jCWuZR044+JDQOmS1cVlZYj0muL0rF1R5te7FNmZzhl6Sh+qR3x8pIIgdCXVgsbvuemyLXkv4Wu/6obusTlXMySYnnnbSWQe3rHe9TCsrdfeu3526PVu9L3WjPaC+Pxmvr4LvClwJqwbRb3U0rOdUgYwL/dEHnkmcutouMFuoWJfX6n3+vwW3fHb3EDbatrXPa9v2/H+279CwkiyT3+d5ux+xLNO3ZuX3Of+3c1u7+MyfbZ+N5zq1Vl7h+wSxxx3UNkfLXeO+/raqfrk7MT1u7XMsHYNcDefOz9le/cm/D3+H9uPZy0nzv1a/zP63k+76xov7PPrWwD5oHQqfs7na3usVSF3PPIL5yQXGusvy0nveh5fHlNV/Rtch6THrObRshpfkc/vMZWhAlmnBSsA6V/cG3y+IHXfQM4A14euuB13nSjDh5JaesZeT23dU1cuXW6U/cE9XxnHK45fqw9JHVlX+/ferFru7trJd/fZX+XttsRsvbQtmFWihbMYLsbvMW+tVft8Prej/fmognPU42+4nFJgpiL27qj59sXlpVf3ehZ3SJJ2TTU48h1o+8iWdJvnZx31dirHvkksZffdEfpd/91eq7f/OueI+NAatb3FqLWJ990i2zbi1S9UC671WgdZSllaynCMPfW5by1HGj/5LVeWRbetXa2HuW5q3MFsPbl+3PBv8voWydWwiMFMQe0dVvXDZ60s9ouGh8JXic/WU8JUWsD2McdikIux8Je0k3bzzb4OEd37QbN7NCbQLK+fFmzv0dvgcgZmCWBtMmVaPrfr8E7zaDOS5qrtvvblDKAHslrofz6lb3kuAAAECBAg8IDBLEOunTTjl8Tptorx+Tqb1vC2HqFrrVwKYFhgfJwIECBAgQGBTgVmCWFqr3rrs+UPPmUzAapNhZvxCPzbpGLy0uKXVK+HLHTDHiFmGAAECBAgQOElgliDWP+cw4w/yMNoEpbR09U+eP6aV666Wr4SvBC9djydVJW8iQIAAAQIEHiswSxBbP+cw+/mnVfWZj93hZfn2zK4Erzaj8Ymr8jYCBAgQIECAwGkCswSx7F3uUnzNI3ezzQ/TwpYHIT8S0OIECBAgQIDA5QRmCmJR+Ouqeu4dHO2ZfO2p9Cbgu1y9sWYCBAgQIEBgA4HZglgG7f9kVX1yVeXuyRa68qe5azaoEFZBgAABAgQIPJ3AbEHs6WSURIAAAQIECBC4sIAgdmFgqydAgAABAgQI3CUgiKkbBAgQIECAAIFBAoLYIHjFEiBAgAABAgQEMXWAAAECBAgQIDBIQBAbBK9YAgQIECBAgIAgpg4QIECAAAECBAYJCGKD4BVLgAABAgQIEBDE1AECBAgQIECAwCABQWwQvGIJECBAgAABAoKYOkCAAAECBAgQGCQgiA2CVywBAgQIECBAQBBTBwgQIECAAAECgwQEsUHwiiVAgAABAgQICGLqAAECBAgQIEBgkIAgNghesQQIECBAgAABQUwdIECAAAECBAgMEhDEBsErlgABAgQIECAgiKkDBAgQIECAAIFBAoLYIHjFEiBAgAABAgQEMXWAAAECBAgQIDBIQBAbBK9YAgQIECBAgIAgpg4QIECAAAECBAYJCGKD4BVLgAABAgQIEBDE1AECBAgQIECAwCABQWwQvGIJECBAgAABAoKYOkCAAAECBAgQGCQgiA2CVywBAgQIECBAQBBTBwgQIECAAAECgwQEsUHwiiVAgAABAgQICGLqAAECBAgQIEBgkIAgNghesQQIECBAgAABQUwdIECAAAECBAgMEhDEBsErlgABAgQIECAgiKkDBAgQIECAAIFBAoLYIHjFEiBAgAABAgQEMXWAAAECBAgQIDBIQBAbBK9YAgQIECBAgIAgpg4QIECAAAECBAYJCGKD4BVLgAABAgQIEPgfLff0tUQtlzEAAAAASUVORK5CYII="

        const blank = Path.resolve(__dirname, '..', 'forms/declaration.pdf');

        const pdfDoc = await PDFDocument.load(Fs.readFileSync(blank));

        const pages = pdfDoc.getPages();
        const page = pages[1];//signature page is 2nd

        if (variables.signature) {
            const signature = this.convertDataURIToBinary(variables.signature);

            //we have to embed the image, then draw it onto the page, because pdf
            const pngImage = await pdfDoc.embedPng(signature);
            const sigWidth = pngImage.width;
            const sigHeight = pngImage.height;

            const scaling = 62 / sigHeight;


            //this is in points in the Acrobat UI
            //these magical numbers were pulled from the underlying PDF by hand.
            //Updates to that file will have to replicate that process and update here
            page.drawImage(pngImage, {
                x: 57,
                y: 389,
                width: sigWidth * scaling,
                height: sigHeight * scaling
            });
        }

        if (variables.formattedDate) {
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

            page.drawText(variables.formattedDate, {
                x: 382,
                y: 394,
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
                format: 'A4',
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

            const page = await browser.newPage();
            await page.goto(`data: text/html,${result}`, {
                waitUntil: 'networkidle0'
            });
            await page.pdf(options);
            await browser.close();
            return filledName;
        }
        catch (error) {
            console.log(error);
            throw new Boom.Boom('Cannot handle the form template content.');
        }
    }

};
