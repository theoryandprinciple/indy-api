'use strict';

const { Model } = require('./helpers');

const Joi = require('joi');
const { v4: Uuid } = require('uuid');

module.exports = class Demographics extends Model {

    static get tableName() { return 'Demographics'; } // eslint-disable-line

    static get joiSchema() {

        return Joi.object({

            id: Joi.string().uuid().default(() => {

                return Uuid({
                    rng: Uuid.nodeRNG
                });
            }),
            race: Joi.string(),
            gender: Joi.string(),
            zip: Joi.string(),
            createdAt: Joi.date().iso()
        });
    }
};
