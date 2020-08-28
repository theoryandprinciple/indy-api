#!/bin/bash
set -e

# PostgreSQL Set Up
if [ -n "$DB_NAME" ]; then
echo "Creating citext extension in $DB_NAME"

# connect to your database; you set extensions by database, not globally
# add the citext extension
# and then lists the extensions added to our database i.e. checks our work
psql postgres <<-EOSQL
    CREATE USER $DB_USER;
    ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    ALTER USER $DB_USER WITH SUPERUSER;
    CREATE DATABASE $DB_NAME WITH OWNER $DB_USER;
    \connect $DB_NAME
    CREATE EXTENSION IF NOT EXISTS citext;
    \dx
    \q
EOSQL

fi
