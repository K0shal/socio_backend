const { verifyGoogleToken, getCurrentUser, authenticateToken } = require('../controllers');
const { googleTokenSchema } = require('../validators/authValidator');

const authRoutes = [
  {
    method: 'POST',
    path: '/api/auth/google',
    handler: verifyGoogleToken,
    options: {
      auth: false,
      validate: {
        payload: googleTokenSchema,
        failAction: (request, h, error) => {
          return h.response({
            error: 'Validation failed',
            details: error.details[0].message
          }).code(400);
        }
      },
      description: 'Verify Google ID token and authenticate user'
    }
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    handler: getCurrentUser,
    options: {
      auth: false,
      pre: [{ method: authenticateToken, assign: 'key' }],
      description: 'Get current user profile'
    }
  }
];

module.exports = authRoutes;
