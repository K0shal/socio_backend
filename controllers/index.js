const { verifyGoogleToken, getCurrentUser, updateProfile } = require('./authController');
const { sendFriendRequest, getFriendRequests, acceptFriendRequest, rejectFriendRequest, getFriends, removeFriend, checkFriendshipStatus } = require('./friendsController');

module.exports = {
  verifyGoogleToken,
  getCurrentUser,
  updateProfile,
  sendFriendRequest,
  getFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  removeFriend,
  checkFriendshipStatus,
};
