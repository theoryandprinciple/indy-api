'use strict';

exports.up = (knex, Promise) => {

    return knex.schema.createTable('Demographics', (table) => {

        table.string('id').primary();
        table.string('race');
        table.string('gender');
        table.timestamp('createdAt').defaultTo(knex.fn.now());
    });
};

exports.down = (knex, Promise) => {

    // $lab:coverage:off$
    return knex.schema.dropTable('Demographics');
    // $lab:coverage:on$
};
