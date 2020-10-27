'use strict';

exports.up = (knex, Promise) => {

    return knex.schema.table('Demographics', (table) => {

        table.string('zip');
    });
};

exports.down = (knex, Promise) => {

    // $lab:coverage:off$
    return knex.schema.table('Demographics', (table) => {

        table.dropColumn('role');
    });
    // $lab:coverage:on$
};
