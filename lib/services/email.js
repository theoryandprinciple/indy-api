'use strict';

const AWS = require('aws-sdk');
const Boom = require('@hapi/boom');
const Fs = require('fs');
const Handlebars = require('handlebars');
const HtmlToText = require('html-to-text');
const Nodemailer = require('nodemailer');
const Path = require('path');
const Schmervice = require('schmervice');
const Util = require('util');

const Sendemail = Util.promisify(require('sendemail').email);

const ReadFile = Util.promisify(Fs.readFile);

const Transporter = Nodemailer.createTransport({
    SES: new AWS.SES({
        apiVersion: '2010-12-01'
    })
});

const Templates = Path.resolve(__dirname, '..', 'templates/email');

// expects data to be template variables set as desired for placement in templates
module.exports = class EmailService extends Schmervice.Service {

    getSubject(context) {

        // $lab:coverage:off$
        switch (context) {
            case 'reset-password':
                return 'User Password Reset';
            case 'declaration':
                return ''
            default:
                return 'Default email case';
        }
        // $lab:coverage:on$
    }

    async send(template, user, data) {

        data.siteUrl = this.options.siteUrl;

        const { html, text } = await this.prepareTemplate(template, data);
        const subject = this.getSubject(template);
        const mailOptions = {
            from: this.options.emailSender,
            to: user.email,
            subject,
            html,
            text
        };

        try {
            await Transporter.sendMail(mailOptions);
        }
        catch (err) {
            //todo something here
            console.log(err);
        }
    }

    // recipient is expected to be a Users instance
    // all data is expected to be formatted
    // send(context, recipient, data) {

    //     data.siteUrl = this.options.siteUrl;

    //     const envelope = {
    //         email: recipient.email,
    //         subject: this.getSubject(context),
    //         templateVars: data
    //     };

    //     return Sendemail(context, envelope);
    // }

    async sendWithForm({ email, template, variables, signedUrl }) {

        const s3 = new AWS.S3();

        variables.siteUrl = this.options.siteUrl;

        const { html, text } = await this.prepareTemplate(template, variables);
        const subject = this.configure(template);
        const mailOptions = {
            from: this.options.emailSender,
            to: email,
            subject,
            html,
            text,
            attachments: [{ filename: 'Declaration.pdf', path: signedUrl }]
        };

        try {
            await Transporter.sendMail(mailOptions);
        }
        catch (err) {
            console.error(err);
        }
    }

    async prepareTemplate(filename, options = {}) {

        try {

            const templatePath = Path.resolve(Templates, `${filename}.html`);
            const content = await ReadFile(templatePath, 'utf8');

            // use handlebars to render the email template
            // handlebars allows more complex templates with conditionals and nested objects, etc.
            // this way we have much more options to customize the templates based on given data
            const template = Handlebars.compile(content);
            const html = template(options);

            // generate a plain-text version of the same email
            const text = HtmlToText.fromString(html);

            return { html, text };
        }
        catch (error) {

            throw new Boom.Boom('Cannot read the email template content.');
        }
    }
};
