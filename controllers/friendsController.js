const { FriendRequests, Friends, User } = require('../models/index');
const Joi = require('joi');
const { Conversations } = require('../models/index');
const { successResponse, errorResponse } = require('../common/response');

// Send friend request
const sendFriendRequest = async (request, h) => {
  try {
    const { receiverId } = request.payload;
    const senderId = request.auth.credentials.userId;

    // Validate input
    const schema = Joi.object({
      receiverId: Joi.string().required()
    });

    const { error } = schema.validate({ receiverId });
    if (error) {
      return errorResponse(h, error.details[0].message, 400);
    }

    // Check if trying to send request to self
    if (senderId.toString() === receiverId) {
      return errorResponse(h, 'Cannot send friend request to yourself', 400);
    }

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return errorResponse(h, 'User not found', 404);
    }

    // Check if already friends
    const existingFriendship = await Friends.findOne({
      $or: [
        { user: senderId, friend: receiverId },
        { user: receiverId, friend: senderId }
      ]
    });

    if (existingFriendship) {
      return errorResponse(h, 'Already friends with this user', 400);
    }

    // Check if request already exists
    const existingRequest = await FriendRequests.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    });

    if (existingRequest) {
      return errorResponse(h, 'Friend request already exists', 400);
    }

    // Create friend request
    const friendRequest = new FriendRequests({
      sender: senderId,
      receiver: receiverId,
      status: 'pending'
    });

    await friendRequest.save();
    await friendRequest.populate([
      { path: 'sender', select: 'name email profilePicture' },
      { path: 'receiver', select: 'name email profilePicture' }
    ]);

    // Emit real-time notification to receiver
    const io = request.server.plugins.socket.io;
    io.to(receiverId).emit('friendRequestReceived', {
      requestId: friendRequest._id,
      sender: friendRequest.sender,
      message: 'You have a new friend request!'
    });

    return successResponse(h, { friendRequest }, 'Friend request sent successfully', 201);

  } catch (error) {
    console.error('Error sending friend request:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

// Get friend requests for current user
const getFriendRequests = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const { status = 'pending', type = 'received' } = request.query;

    // Build query based on parameters
    let query = {};
    
    // Filter by type: received (requests sent to user) or sent (requests sent by user)
    // if (type === 'received') {
    //   query.receiver = userId;
    // } else if (type === 'sent') {
    //   query.sender = userId;
    // } else {
      query.$or = [
        { receiver: userId },
        { sender: userId }
      ];
      query.status = 'pending';
    // }

    // Filter by status if specified (only applies when type is not 'all')
    if (status && status !== 'all' && type !== 'all') {
      query.status = status;
    }
    const friendRequests = await FriendRequests.find(query)
      .populate('sender', 'name email profilePicture')
      .populate('receiver', 'name email profilePicture')
      .sort({ requestDate: -1 });

    return successResponse(h, {
      friendRequests,
      count: friendRequests.length,
      filters: { status, type }
    }, 'Friend requests retrieved successfully');

  } catch (error) {
    console.error('Error getting friend requests:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

// Accept friend request
const acceptFriendRequest = async (request, h) => {
  try {
    const { requestId } = request.params;
    const userId = request.auth.credentials.userId;

    // Find friend request
    const friendRequest = await FriendRequests.findById(requestId);
    if (!friendRequest) {
      return errorResponse(h, 'Friend request not found', 404);
    }

    // Check if user is receiver of request
    if (friendRequest.receiver.toString() !== userId) {
      return errorResponse(h, 'Unauthorized', 403);
    }

    // Check if request is still pending
    if (friendRequest.status !== 'pending') {
      return errorResponse(h, 'Friend request already processed', 400);
    }

    // Update request status
    friendRequest.status = 'accepted';
    friendRequest.responseDate = new Date();
    await friendRequest.save();

    // Create friendship records (both directions)
    const friendship1 = new Friends({
      user: friendRequest.sender,
      friend: friendRequest.receiver
    });

    const friendship2 = new Friends({
      user: friendRequest.receiver,
      friend: friendRequest.sender
    });

    await Promise.all([friendship1.save(), friendship2.save()]);

    // Populate sender info for notification
    await friendRequest.populate('sender', 'name email profilePicture');

    // Emit real-time notification to sender
    const receiverUser = await User.findById(friendRequest.receiver).select('name email profilePicture');
    const io = request.server.plugins.socket.io;
    io.to(friendRequest.sender.toString()).emit('friendRequestAccepted', {
      requestId: friendRequest._id,
      receiver: receiverUser,
      message: 'Your friend request was accepted!'
    });

    return successResponse(h, { friendship: friendship1 }, 'Friend request accepted successfully');

  } catch (error) {
    console.error('Error accepting friend request:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

// Reject friend request
const rejectFriendRequest = async (request, h) => {
  try {
    const { requestId } = request.params;
    const userId = request.auth.credentials.userId;

    // Find friend request
    const friendRequest = await FriendRequests.findById(requestId);
    if (!friendRequest) {
      return errorResponse(h, 'Friend request not found', 404);
    }

    // Check if user is receiver of request
    if (friendRequest.receiver.toString() !== userId) {
      return errorResponse(h, 'Unauthorized', 403);
    }

    // Check if request is still pending
    if (friendRequest.status !== 'pending') {
      return errorResponse(h, 'Friend request already processed', 400);
    }

    // Update request status
    friendRequest.status = 'rejected';
    friendRequest.responseDate = new Date();
    await friendRequest.save();

    return successResponse(h, {}, 'Friend request rejected successfully');

  } catch (error) {
    console.error('Error rejecting friend request:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

// Get friends list
const getFriends = async (request, h) => {
  try {
    const { userId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    // Get friends for specified user
    const friends = await Friends.find({ user: userId })
      .populate('friend', 'name email profilePicture')
      .sort({ friendshipDate: -1 });

    const friendList = friends.map(f => f.friend);

    return successResponse(h, {
      friends: friendList,
      count: friendList.length
    }, 'Friends retrieved successfully');

  } catch (error) {
    console.error('Error getting friends:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

// Remove friend
const removeFriend = async (request, h) => {
  try {
    const { friendId } = request.params;
    const userId = request.auth.credentials.userId;

    // Remove friendship records (both directions)
    await Friends.deleteMany({
      $or: [
        { user: userId, friend: friendId },
        { user: friendId, friend: userId }
      ]
    });

    // Create a new pending friend request from current user to removed friend
    const existingRequest = await FriendRequests.findOne({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId }
      ]
    });

    // If there's an existing request, delete it first to avoid unique constraint issues
    if (existingRequest) {
      await FriendRequests.deleteOne({ _id: existingRequest._id });
    }

    // Create new pending friend request
    const newFriendRequest = new FriendRequests({
      sender: userId,
      receiver: friendId,
      status: 'pending',
      requestDate: new Date(),
      responseDate: undefined // Clear any previous response date
    });

    await newFriendRequest.save();
    await newFriendRequest.populate([
      { path: 'sender', select: 'name email profilePicture' },
      { path: 'receiver', select: 'name email profilePicture' }
    ]);

    // Find and deactivate conversations between these users
    await Conversations.updateMany(
      {
        'participants.user': { $all: [userId, friendId] },
        isActive: true
      },
      {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedReason: 'friendship_removed'
      }
    );

    // Emit real-time notification to both users
    const io = request.server.plugins.socket.io;
    
    // Notify removed friend that they have a new friend request
    io.to(friendId).emit('friendRequestReceived', {
      requestId: newFriendRequest._id,
      sender: newFriendRequest.sender,
      message: 'You have a new friend request!'
    });

    // Notify current user that the friendship was removed
    io.to(userId).emit('friendRemoved', {
      friendId: friendId,
      message: 'Friendship has been removed and a new friend request has been sent'
    });

    return successResponse(h, {
      friendRequest: newFriendRequest
    }, 'Friend removed successfully and new friend request sent');

  } catch (error) {
    console.error('Error removing friend:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

// Check friendship status
const checkFriendshipStatus = async (request, h) => {
  try {
    const { userId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    // Check if they are friends
    const friendship = await Friends.findOne({
      $or: [
        { user: currentUserId, friend: userId },
        { user: userId, friend: currentUserId }
      ]
    });

    // Check if there's a pending request
    const friendRequest = await FriendRequests.findOne({
      $or: [
        { sender: currentUserId, receiver: userId, status: 'pending' },
        { sender: userId, receiver: currentUserId, status: 'pending' }
      ]
    });

    let status = 'none';
    if (friendship) {
      status = 'friends';
    } else if (friendRequest) {
      if (friendRequest.sender.toString() === currentUserId) {
        status = 'request_sent';
      } else {
        status = 'request_received';
      }
    }

    return successResponse(h, {
      status,
      isFriend: status === 'friends',
      requestSent: status === 'request_sent',
      requestReceived: status === 'request_received'
    }, 'Friendship status retrieved successfully');

  } catch (error) {
    console.error('Error checking friendship status:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

module.exports = {
  sendFriendRequest,
  getFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  removeFriend,
  checkFriendshipStatus
};
