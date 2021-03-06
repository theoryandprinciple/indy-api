'use strict';

const { Model } = require('./helpers');

const Joi = require('joi');
const { v4: Uuid } = require('uuid');

module.exports = class Tokens extends Model {

    static get tableName() { return 'Tokens'; } // eslint-disable-line

    static get joiSchema() {

        return Joi.object({

            userId: Joi.number().integer().min(1),
            id: Joi.string().uuid().default(() => {

                return Uuid({
                    rng: Uuid.nodeRNG
                });
            }),
            createdAt: Joi.date().iso()
        });
    }

    static get relationMappings() {

        return {
            user: {
                relation: Model.BelongsToOneRelation,
                modelClass: require('./Users'),
                join: {
                    from: 'Tokens.userId',
                    to: 'Users.id'
                }
            }
        };
    }

    $beforeInsert() {

        this.createdAt = new Date().toISOString();
    }
};
