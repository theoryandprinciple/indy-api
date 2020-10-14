'use strict';

const Joi = require('joi');

module.exports = (server, options) => {

    return {
        method: 'POST',
        path: '/declaration',
        config: {
            description: 'Generate Declaration and cover letter as pdf',
            tags: ['api'],
            validate: {
                payload: Joi.object({
                    signature: Joi.string().required(),
                    date: Joi.date().required(),
                    tenant: Joi.object({
                        firstName: Joi.string(),
                        lastName: Joi.string(),
                        address: Joi.string(),
                        address2: Joi.string(),
                        city: Joi.string(),
                        state: Joi.string(),
                        zip: Joi.string()
                    }),
                    landlord: Joi.object({
                        name: Joi.string(),
                        address: Joi.string(),
                        address2: Joi.string(),
                        city: Joi.string(),
                        state: Joi.string(),
                        zip: Joi.string(),
                        email: Joi.string().email()
                    })
                })
            }
        },
        handler: async (request, h) => {

            const { declarationService } = request.services();

            const filled = async (trx) => {

                return await declarationService.generate(request.payload, trx);
            };

            return await h.context.transaction(filled);
        }
    };
};
