'use strict';

const internals = {};

module.exports = (srv, options) => {

    return {
        name: 'api-user-jwt',
        scheme: 'jwt',
        options: {
            keys: options.jwtKey,
            validate: internals.validate,
            httpAuthScheme: 'Bearer',
            verify: {
                // audience intended to receive
                aud: false,
                // issuer of the jwt
                iss: false,
                // verify subject of jwt
                sub: false,
                // check expiry - default true
                exp: false,
                // skew secs
                timeSkewSec: 5//,
                // max age (secs) of the JWT allowed.  Need to set up token refresh to make this happen
                // maxAgeSec: 1500
            }
        }
    };
};

internals.validate = async function (artifacts, request) {

    const { Tokens } = request.models();

    const foundToken = await Tokens.query().findById(artifacts.decoded.payload.jti).withGraphFetched('user');

    if (foundToken) {

        return {
            isValid: true,
            credentials: { user: foundToken.user, scope: foundToken.user.role, jti: foundToken.id }
        };
    }

    return { isValid: false };
};
