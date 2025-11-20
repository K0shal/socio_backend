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
       
      },
      description: 'Verify Google ID token and authenticate user'
    }
  }
];


module.exports=authRoutes