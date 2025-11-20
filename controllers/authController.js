const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { authResponse, successResponse, errorResponse, notFoundResponse, unauthorizedResponse, serverErrorResponse } = require('../common');

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

const verifyGoogleToken = async (request, h) => {
  try {
    const { token } = request.payload;
    

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
    const user = await User.findById(request.auth.credentials.userId).select('-password');
    if (!user) {
      return notFoundResponse(h, 'User not found');
    }
    return successResponse(h, { user }, 'User retrieved successfully');
  } catch (error) {
    console.error('Get current user error:', error);
    return serverErrorResponse(h, 'Failed to get user');
  }
};

const updateProfile = async (request, h) => {
  try {
    const { name, profilePicture } = request.payload;
    const userId = request.auth.credentials.userId;

    const user = await User.findById(userId);
    if (!user) {
      return notFoundResponse(h, 'User not found');
    }


    if (name) user.name = name;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;

    await user.save();

    return successResponse(h, { user }, 'Profile updated successfully');
  } catch (error) {
    console.error('Update profile error:', error);
    return serverErrorResponse(h, 'Failed to update profile');
  }
};



module.exports = {
  verifyGoogleToken,
  getCurrentUser,
  updateProfile,
};
