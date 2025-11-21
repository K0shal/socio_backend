const Joi = require('joi');
const friendsController = require('../controllers/friendsController');

const friendsRoutes = [
  // Send friend request
  {
    method: 'POST',
    path: '/api/users/friend-request',
    handler: friendsController.sendFriendRequest,
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          receiverId: Joi.string().required()
        })
      }
    }
  },

  // Get friend requests for current user
  {
    method: 'GET',
    path: '/api/users/friend-requests',
    handler: friendsController.getFriendRequests,
    options: {
      auth: 'jwt'
    }
  },

  // Accept friend request
  {
    method: 'POST',
    path: '/api/users/friend-request/{requestId}/accept',
    handler: friendsController.acceptFriendRequest,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          requestId: Joi.string().required()
        })
      }
    }
  },

  // Reject friend request
  {
    method: 'POST',
    path: '/api/users/friend-request/{requestId}/reject',
    handler: friendsController.rejectFriendRequest,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          requestId: Joi.string().required()
        })
      }
    }
  },

  // Get friends list for a user
  {
    method: 'GET',
    path: '/api/users/{userId}/friends',
    handler: friendsController.getFriends,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          userId: Joi.string().required()
        })
      }
    }
  },

  // Remove friend
  {
    method: 'DELETE',
    path: '/api/users/friends/{friendId}',
    handler: friendsController.removeFriend,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          friendId: Joi.string().required()
        })
      }
    }
  },

  // Check friendship status
  {
    method: 'GET',
    path: '/api/users/{userId}/friendship-status',
    handler: friendsController.checkFriendshipStatus,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          userId: Joi.string().required()
        })
      }
    }
  }
];

module.exports = friendsRoutes;
