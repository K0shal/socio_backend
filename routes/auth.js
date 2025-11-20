const { verifyGoogleToken, getCurrentUser, updateProfile, authenticateToken } = require('../controllers');
const { googleTokenSchema } = require('../validators/authValidator');

const authRoutes = [
  {
    method: 'POST',
    path: '/api/auth/google',
    handler: verifyGoogleToken,
    options: {
      auth: false,
      validate: {
        payload: googleTokenSchema
      },
      description: 'Verify Google ID token and authenticate user'
    }
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    handler: getCurrentUser,
    options: {
      auth: {
        strategy: 'jwt',
        mode: 'required'
      },
      description: 'Get current authenticated user'
    }
  },
  {
    method: 'PUT',
    path: '/api/auth/update-profile',
    handler: updateProfile,
    options: {
      auth: {
        strategy: 'jwt',
        mode: 'required'
      },
      description: 'Update user profile'
    }
  }
];


module.exports=authRoutes
