const jwt = require('jsonwebtoken');
const config = require('../config/config');

const registerAuthMiddleware = async (server) => {
  await server.register(require('@hapi/jwt'));


  server.auth.strategy('jwt', 'jwt', {
    keys: config.JWT_SECRET,
    verify: {
      aud: false,
      iss: false,
      sub: false,

    },
    validate: async (artifacts, request, h) => {
      try {
        const {payload} = artifacts.decoded;

        return {
          isValid: true,
          credentials: {
            userId: payload.userId,
            email: payload.email,
            iat: payload.iat
          }
        };
      } catch (error) {
        console.error('JWT validation error:', error);
        return {
          isValid: false,
          credentials: null
        };
      }
    }
  });

  server.auth.default('jwt');
};

module.exports = {
  registerAuthMiddleware
};
