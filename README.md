# Indy Renter Help

This is the API for [Indy Renter Help](https://indyrenterhelp.org/) which is a web app that will help struggling renters obatin protection they are entitled to under the current CDC Federal Eviction Moratorium.

**Features**
 - Supports hapi v19+
 - Provides conventions for building plugins by mapping the entire hapi plugin API onto files and folders, using [haute-couture](https://github.com/hapipal/haute-couture/).
 - Integrated with [Objection ORM](https://github.com/Vincit/objection.js/) via [Schwifty](https://github.com/hapipal/schwifty/)
 - Configured to use PostgreSQL (NODE_ENV=development) (though can work with any SQL dialect supported by [knex](http://knexjs.org/))
 - Swagger UI provides an easy interface to your API at `/documentation`
 - Fully setup with a [lab](https://github.com/hapijs/lab) test suite and [eslint](https://github.com/eslint/eslint) configuration.
 - Up-to-date versions of all dependencies.

## What you'll need
 - AWS account.  This project uses AWS S3 for storage of the completed forms and AWS Simple Email Service for transactional emails.  We also host our version of this project on AWS EC2, but it will run fine on most linux distributions.
 - Front end - this is the API, but it does not provide a friendly user interface.  You'll want to look at [https://github.com/theoryandprinciple/indy-frontend/] (https://github.com/theoryandprinciple/indy-frontend/)
 - (Optional) Lob account.  This app has the ability to interface with Lob to allow users to mail a letter to their landlord/property manager.  In our case, this functionality is limited to users in a pre-defined set of zip codes - because Lob charges per-letter, it could get expensive quickly if left ungated.

## Getting Started
```bash
$ git clone --depth=1 --origin=indy-original git@github.com:theoryandprinciple/indy-api.git my-project
$ cd my-project
$ git checkout --orphan master # New branch without history
$ npm install
$ cp server/.env-keep server/.env
$ cp server/.env server/.env-test
```
 - If using Lob, update the list of eligible Zip Codes in `lib/services/declaration.js`
 - Use `npm link` to link in to the front end of the app, which will run as a plugin.
 - Open `.env` and `.env-test` in your editor of choice and fill in the variables there (presumes you've created empty databases in the SQL dialect of your choice).  `.env-test` should point at a different database from `.env`, as all data will be lost each time `npm run test` is executed.


### Using Docker
See [here](DOCKER.md) for more details about using Docker.

### Database note
The app is currently only using a database to collect information about the demographics of
users.  If that functionality isn't needed, it would be straightforward to remove the database
functionality altogether.

#### Database Setup
To use a Docker containerized Database with your application there are two flavors available
in the `docker-compose.yml` file.  By default the app is set up to use a **PostgreSQL Database**.
You will need to modify the connection details for the instance you wish to create.

To use a **MySQL Database** instead, uncomment the db service notated as "MySQL Database" in the `docker-compose.yml` file and comment the db service notated as "PostreSQL Database".  Modify
the connection details as needed.  And finally, update in `web_base` and `test_base`
the `command` property to `wait-for` the correct port for the database (i.e. `./wait-for db:3306`).

To bootstrap the Database with an sql dump when it's created you can place a `.sql` or `.sql.gz` file
in the `./data` directory.  Any number of files can be added here and will be run in alphanumeric order.
Make sure any files that you add are not ordered to run earlier than the 00-db-init.sh file.

See [here](https://hub.docker.com/_/postgres) for more details on customizing a PostgreSQL Docker
Container or [here](https://hub.docker.com/_/mysql) for MySQL Docker Container customization.


### Not Using Docker
#### Database Setup
If you'll be connecting to a PostgreSQL database, ensure that your database is properly configured with the `citext` extension (see [Working with PostgreSQL's citext Extension](#working-with-postgresqls-citext-extension)) below.

If you aren't using PostgreSQL, comment out or delete the `citext` column command and uncomment the generic email column command in the [migration file](lib/migrations/20170927113421_users-tokens.js). You may want to consider taking some other additional step to prevent mis-identifying users due to inconsistent email casing (reason described below). For example, using [Objection's $beforeInsert](https://vincit.github.io/objection.js/#_s_beforeinsert) to normalize email casing on user creation.

#### Working with PostgreSQL's `citext` Extension
We use PostgreSQL's `citext` type for the email column for our Users table to ensure user emails are case insensitively unique, which we need to reliably authenticate users. In practice, major email service providers treat email addresses case insensitively e.g. `inbox@email.com` and `InbOx@email.com` identify the same address. Uniqueness is case-sensitive by default, however, meaning that without intervention, our base application would mistakenly interpret those 2 casings of the same email address as 2 different users. Because [we depend on email addresses to uniquely identify and authenticate users](lib/routes/users-login.js#L34), we would end up — likely to the user's confusion — telling the same person they exist and don't exist by our accounting depending on how they spell their email on signup and login (consider, for example, that iPhone virtual keyboards autocapitalize the first letters of new words).

 To setup `citext` on your new database:

```sh
psql postgres # login as the root user
\connect DB_NAME # connect to your database; you set extensions by database, not globally
CREATE EXTENSION IF NOT EXISTS citext
\dx # lists the extensions added to our database i.e. checks our work
\q
```

Further reading: https://nandovieira.com/using-insensitive-case-columns-in-postgresql-with-citext

## Running
With Docker:
```bash
$ npm run docker:start
```

Without Docker:
```bash
$ npm start
```

Open [http://0.0.0.0:4000/documentation](http://0.0.0.0:4000/documentation) (assuming you used port 4000 in your .env file) in a web browser to start using your api.

## Committing
When you're ready to point this at your own Github repo and start committing:

```bash
$ git remote add origin git@github.com:my-username/my-project.git
$ npm init # Rename, reversion, describe your plugin
$ git commit -am "Building on top of the Indy Renter Help App"
$ git push -u origin master:master
```
