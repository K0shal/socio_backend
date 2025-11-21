const { FriendRequests, Friends, User } = require('../models/index');
const Joi = require('joi');

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
      return h.response({ error: error.details[0].message }).code(400);
    }

    // Check if trying to send request to self
    if (senderId.toString() === receiverId) {
      return h.response({ error: 'Cannot send friend request to yourself' }).code(400);
    }

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return h.response({ error: 'User not found' }).code(404);
    }

    // Check if already friends
    const existingFriendship = await Friends.findOne({
      $or: [
        { user: senderId, friend: receiverId },
        { user: receiverId, friend: senderId }
      ]
    });

    if (existingFriendship) {
      return h.response({ error: 'Already friends with this user' }).code(400);
    }

    // Check if request already exists
    const existingRequest = await FriendRequests.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    });

    if (existingRequest) {
      return h.response({ error: 'Friend request already exists' }).code(400);
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

    return h.response({
      message: 'Friend request sent successfully',
      friendRequest
    }).code(201);

  } catch (error) {
    console.error('Error sending friend request:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// Get friend requests for current user
const getFriendRequests = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;

    const friendRequests = await FriendRequests.find({
      receiver: userId,
      status: 'pending'
    }).populate('sender', 'name email profilePicture')
      .sort({ requestDate: -1 });

    return h.response({
      friendRequests,
      count: friendRequests.length
    });

  } catch (error) {
    console.error('Error getting friend requests:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// Accept friend request
const acceptFriendRequest = async (request, h) => {
  try {
    const { requestId } = request.params;
    const userId = request.auth.credentials.userId;

    // Find the friend request
    const friendRequest = await FriendRequests.findById(requestId);
    if (!friendRequest) {
      return h.response({ error: 'Friend request not found' }).code(404);
    }

    // Check if the user is the receiver of the request
    if (friendRequest.receiver.toString() !== userId) {
      return h.response({ error: 'Unauthorized' }).code(403);
    }

    // Check if request is still pending
    if (friendRequest.status !== 'pending') {
      return h.response({ error: 'Friend request already processed' }).code(400);
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

    return h.response({
      message: 'Friend request accepted successfully',
      friendship: friendship1
    });

  } catch (error) {
    console.error('Error accepting friend request:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// Reject friend request
const rejectFriendRequest = async (request, h) => {
  try {
    const { requestId } = request.params;
    const userId = request.auth.credentials.userId;

    // Find the friend request
    const friendRequest = await FriendRequests.findById(requestId);
    if (!friendRequest) {
      return h.response({ error: 'Friend request not found' }).code(404);
    }

    // Check if the user is the receiver of the request
    if (friendRequest.receiver.toString() !== userId) {
      return h.response({ error: 'Unauthorized' }).code(403);
    }

    // Check if request is still pending
    if (friendRequest.status !== 'pending') {
      return h.response({ error: 'Friend request already processed' }).code(400);
    }

    // Update request status
    friendRequest.status = 'rejected';
    friendRequest.responseDate = new Date();
    await friendRequest.save();

    return h.response({
      message: 'Friend request rejected successfully'
    });

  } catch (error) {
    console.error('Error rejecting friend request:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// Get friends list
const getFriends = async (request, h) => {
  try {
    const { userId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    // Get friends for the specified user
    const friends = await Friends.find({ user: userId })
      .populate('friend', 'name email profilePicture')
      .sort({ friendshipDate: -1 });

    const friendList = friends.map(f => f.friend);

    return h.response({
      friends: friendList,
      count: friendList.length
    });

  } catch (error) {
    console.error('Error getting friends:', error);
    return h.response({ error: 'Internal server error' }).code(500);
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

    // Find and deactivate conversations between these users
    const { Conversations } = require('../models/index');
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
    
    // Notify both users that friendship is removed
    io.to(userId).emit('friendRemoved', {
      friendId: friendId,
      message: 'Friendship has been removed'
    });
    
    io.to(friendId).emit('friendRemoved', {
      friendId: userId,
      message: 'Friendship has been removed'
    });

    return h.response({
      message: 'Friend removed successfully'
    });

  } catch (error) {
    console.error('Error removing friend:', error);
    return h.response({ error: 'Internal server error' }).code(500);
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

    return h.response({
      status,
      isFriend: status === 'friends',
      requestSent: status === 'request_sent',
      requestReceived: status === 'request_received'
    });

  } catch (error) {
    console.error('Error checking friendship status:', error);
    return h.response({ error: 'Internal server error' }).code(500);
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
