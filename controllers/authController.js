const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

const verifyGoogleToken = async (request, h) => {
  try {
    const { token } = request.payload;
    console.log(token)

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: config.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const { email, name, picture } = payload;
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name, email, profilePicture: picture
      })

    }

    const jwtToken = jwt.sign(
      {
        userId: user._id,
        email: user.email
      },
      config.JWT_SECRET
    );

    return h.response({
      message: 'Authentication successful',
      user: {
        id: user._id,
        email: user.email,
        profilePicture: user.profilePicture
      },
      token: jwtToken
    }).code(200);

  } catch (error) {
    console.error('Google token verification error:', error);
    return h.response({ error: 'Invalid token' }).code(401);
  }
};

// Get current user
const getCurrentUser = async (request, h) => {
  try {
    const user = await User.findById(request.user.userId).select('-password');
    if (!user) {
      return h.response({ error: 'User not found' }).code(404);
    }
    return h.response({ user }).code(200);
  } catch (error) {
    console.error('Get current user error:', error);
    return h.response({ error: 'Failed to get user' }).code(500);
  }
};

// Verify JWT token middleware
const authenticateToken = (request, h) => {
  const authHeader = request.headers['authorization'];

  if (!authHeader) {
    return h.response({ error: 'Authorization header required' }).code(401);
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return h.response({ error: 'Token required' }).code(401);
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    request.user = decoded;
    return h.continue;
  } catch (error) {
    return h.response({ error: 'Invalid token' }).code(401);
  }
};

module.exports = {
  verifyGoogleToken,
  getCurrentUser,
  authenticateToken
};
