'use strict';

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
        }
    }
};
