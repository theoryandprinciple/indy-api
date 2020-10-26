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
                    signature: Joi.string(),
                    date: Joi.date(),
                    tenant: Joi.object({
                        firstName: Joi.string(),
                        lastName: Joi.string(),
                        address: Joi.string(),
                        address2: Joi.string(),
                        city: Joi.string(),
                        state: Joi.string(),
                        zip: Joi.string(),
                        gender: Joi.string(),
                        race: Joi.string()
                    }),
                    landlord: Joi.object({
                        name: Joi.string(),
                        company: Joi.string(),
                        address: Joi.string(),
                        address2: Joi.string(),
                        city: Joi.string(),
                        state: Joi.string(),
                        zip: Joi.string(),
                        email: Joi.string().email({ tlds: { allow: false } })
                    }),
                    snail: Joi.boolean().default(false),
                    email: Joi.boolean().default(false)
                })
            }
        },
        handler: async (request, h) => {

            const { declarationService } = request.services();

            const filled = async (trx) => {

                return await declarationService.generate(request.payload, trx);
            };

            const data = await h.context.transaction(filled);

            return { data };
        }
    };
};
