'use strict';

const Fs = require('fs').promises;
const Path = require('path');
// hpal run indy:fillForm

module.exports = {
    value: {
        fillCover: async (server) => {

            const { declarationService } = server.services();

            const variables = {
                date: '09/04/2020',
                tenant: {
                    name: 'James Madison',
                    address: '123 Main St.',
                    address2: 'Apartment B',
                    city: 'Saco',
                    state: 'ME',
                    zip: '04005',
                    email: 'matt@theoryandprinciple.com',
                    phoneNumber: '207-867-5309'
                },
                landlord: {
                    name: 'Roger Winn',
                    address: '567 Park Place',
                    city: 'Portland',
                    state: 'ME',
                    zip: '04101',
                    email: 'dev@theoryandprinciple.com'
                }
            };

            await declarationService.fillCover(variables);

            return 'Boom?';
        },
        dumpCsv: async (server) => {

            const { Demographics } = server.models();
            const { emailService } = server.services();
            const data = await Demographics.query();

            const headers = Object.keys(data[0]).join();
            const content = data.map((r) => Object.values(r).join());
            const csvData = [headers].concat(content).join('\n');

            const fileName = Path.resolve(__dirname, '..', 'analytics') + '/' + new Date().getTime() + '.csv';
            await Fs.writeFile( fileName, csvData);

            await emailService.demographicsReport(fileName);
            return;
        }

    }
};
