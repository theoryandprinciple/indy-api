'use strict';

const Confidence = require('confidence');
const Toys = require('toys');

// $lab:coverage:off$
// Pull .env into process.env only if we're not in a Docker container
if (!process.env.IS_DOCKER) {
    const Dotenv = require('dotenv');

    if (process.env.NODE_ENV === 'test') {
        Dotenv.config({ path: `${__dirname}/.env-test` });
    }
    else {
        Dotenv.config({ path: `${__dirname}/.env` });
    }
}
// $lab:coverage:on$

// Glue manifest as a confidence store
module.exports = new Confidence.Store({
    server: {
        host: '0.0.0.0',
        // $lab:coverage:off$
        port: {
            $env: 'PORT',
            $coerce: 'number',
            $default: 4000
        },
        // $lab:coverage:on$
        routes: {
            cors: {
                $filter: { $env: 'NODE_ENV' },
                development: true,
                test: true,
                staging: true,
                production: false
            }
        },
        debug: {
            $filter: { $env: 'NODE_ENV' },
            development: {
                log: ['error', 'implementation', 'internal'],
                request: ['error', 'implementation', 'internal']
            }
        }
    },
    register: {
        plugins: [
            {
                plugin: '../lib', // Main plugin
                options: {
                    jwtKey: process.env.JWT_SECRET,
                    siteUrl: process.env.SITE_URL,
                    s3Bucket: process.env.AWS_S3_BUCKET,
                    emailSender: process.env.SENDER_EMAIL_ADDRESS,
                    reportingEmail: process.env.REPORTING_ADDRESS
                },
                routes: {
                    prefix: process.env.API_PREFIX
                }
            },
            {
                plugin: './plugins/swagger'
            },
            {
                plugin: 'schwifty',
                options: {
                    $filter: { $env: 'NODE_ENV' },
                    $default: {},
                    $base: {
                        migrateOnStart: true,
                        knex: {
                            client: 'sqlite3',
                            useNullAsDefault: true,         // Suggested for sqlite3
                            pool: {
                                idleTimeoutMillis: Infinity // Handles knex v0.12/0.13 misconfiguration when using sqlite3 (tgriesser/knex#1701)
                            },
                            connection: {
                                filename: ':memory:'
                            }
                        }
                    },
                    development: {
                        migrateOnStart: true,
                        knex: {
                            client: 'pg',
                            useNullAsDefault: true,
                            connection: {
                                // $lab:coverage:off$
                                host: process.env.IS_DOCKER ? process.env.DOCKER_DB_HOST : process.env.DB_HOST,
                                // $lab:coverage:on$
                                user: process.env.DB_USER,
                                password: process.env.DB_PASSWORD,
                                database: process.env.DB_NAME
                            }
                        }
                    },
                    test: {
                        migrateOnStart: true,
                        knex: {
                            client: 'pg',
                            useNullAsDefault: true,
                            connection: {
                                host: process.env.DB_HOST,
                                user: process.env.DB_USER,
                                password: process.env.DB_PASSWORD,
                                database: process.env.DB_NAME
                            }
                        }
                    },
                    production: {
                        migrateOnStart: false,
                        knex: {
                            client: 'pg',
                            useNullAsDefault: true,
                            connection: {
                                host: process.env.DB_HOST,
                                user: process.env.DB_USER,
                                password: process.env.DB_PASSWORD,
                                database: process.env.DB_NAME
                            }
                        }
                    }
                }
            },
            { // $lab:coverage:off$
                plugin: process.env.FRONT_END ? process.env.FRONT_END : Toys.noop
            } // $lab:coverage:on$
        ]
    }
});
