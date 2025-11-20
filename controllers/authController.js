const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { authResponse, successResponse, errorResponse, notFoundResponse, unauthorizedResponse, serverErrorResponse } = require('../common');

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

    return authResponse(h, user, jwtToken);

  } catch (error) {
    console.error('Google token verification error:', error);
    return unauthorizedResponse(h, 'Invalid token');
  }
};


const getCurrentUser = async (request, h) => {
  try {
    const user = await User.findById(request.user.userId).select('-password');
    if (!user) {
      return notFoundResponse(h, 'User not found');
    }
    return successResponse(h, { user }, 'User retrieved successfully');
  } catch (error) {
    console.error('Get current user error:', error);
    return serverErrorResponse(h, 'Failed to get user');
  }
};


const authenticateToken = (request, h) => {
  const authHeader = request.headers['authorization'];

  if (!authHeader) {
    return unauthorizedResponse(h, 'Authorization header required');
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return unauthorizedResponse(h, 'Token required');
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    request.user = decoded;
    return h.continue;
  } catch (error) {
    return unauthorizedResponse(h, 'Invalid token');
  }
};

module.exports = {
  verifyGoogleToken,
  getCurrentUser,
  authenticateToken
};
