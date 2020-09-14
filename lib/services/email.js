'use strict';

const Schmervice = require('schmervice');
const Util = require('util');

const Sendemail = Util.promisify(require('sendemail').email);

const internals = {};

// expects data to be template variables set as desired for placement in templates
module.exports = class EmailService extends Schmervice.Service {

    getSubject(context) {

        // $lab:coverage:off$
        switch (context) {
            case 'reset-password':
                return 'User Password Reset';
                break;
            default:
                return 'Default email case';
        }
        // $lab:coverage:on$
    }

    // recipient is expected to be a Users instance
    // all data is expected to be formatted
    send(context, recipient, data) {

        data.siteUrl = this.options.siteUrl;

        const envelope = {
            email: recipient.email,
            subject: this.getSubject(context),
            templateVars: data
        };

        return Sendemail(context, envelope);
    }
};
