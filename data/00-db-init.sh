#!/bin/bash
set -e

# PostgreSQL Set Up
if [ -n "$POSTGRES_DB" ]; then
echo "Creating citext extension in $POSTGRES_DB"

# connect to your database; you set extensions by database, not globally
# add the citext extension
# and then lists the extensions added to our database i.e. checks our work
psql postgres <<-EOSQL
    \connect $POSTGRES_DB
    CREATE EXTENSION IF NOT EXISTS citext;
    \dx
    \q
EOSQL
fi