const { FriendRequests, Friends, User } = require('../models/index');
const Joi = require('joi');
const { Conversations } = require('../models/index');
const { successResponse, errorResponse } = require('../common/response');

const sendFriendRequest = async (request, h) => {
  try {
    const { receiverId } = request.payload;
    const senderId = request.auth.credentials.userId;

    const schema = Joi.object({
      receiverId: Joi.string().required()
    });

    const { error } = schema.validate({ receiverId });
    if (error) {
      return errorResponse(h, error.details[0].message, 400);
    }

    if (senderId.toString() === receiverId) {
      return errorResponse(h, 'Cannot send friend request to yourself', 400);
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return errorResponse(h, 'User not found', 404);
    }

    const existingFriendship = await Friends.findOne({
      $or: [
        { user: senderId, friend: receiverId },
        { user: receiverId, friend: senderId }
      ]
    });

    if (existingFriendship) {
      return errorResponse(h, 'Already friends with this user', 400);
    }

    const existingRequest = await FriendRequests.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    });

    if (existingRequest) {
      return errorResponse(h, 'Friend request already exists', 400);
    }

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

const getFriendRequests = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const { status = 'pending', type = 'received' } = request.query;

    let query = {};
    
    if (type === 'received') {
      query.receiver = userId;
    } else if (type === 'sent') {
      query.sender = userId;
    } else {
      query.$or = [
        { receiver: userId },
        { sender: userId }
      ];
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    console.log('Friend Requests Query:', query);
    console.log('User ID:', userId);
    console.log('Query params:', { status, type });
    
    const friendRequests = await FriendRequests.find(query)
      .populate('sender', 'name email profilePicture')
      .populate('receiver', 'name email profilePicture')
      .sort({ requestDate: -1 });

    console.log('Found friend requests:', friendRequests.length);
    friendRequests.forEach((req, index) => {
      console.log(`Request ${index + 1}:`, {
        id: req._id,
        sender: req.sender?._id || req.sender,
        receiver: req.receiver?._id || req.receiver,
        status: req.status,
        isSenderCurrentUser: (req.sender?._id?.toString() || req.sender?.toString()) === userId.toString(),
        isReceiverCurrentUser: (req.receiver?._id?.toString() || req.receiver?.toString()) === userId.toString()
      });
    });

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

const acceptFriendRequest = async (request, h) => {
  try {
    const { requestId } = request.params;
    const userId = request.auth.credentials.userId;

    const friendRequest = await FriendRequests.findById(requestId);
    if (!friendRequest) {
      return errorResponse(h, 'Friend request not found', 404);
    }

    if (friendRequest.receiver.toString() !== userId) {
      return errorResponse(h, 'Unauthorized', 403);
    }

    if (friendRequest.status !== 'pending') {
      return errorResponse(h, 'Friend request already processed', 400);
    }

    friendRequest.status = 'accepted';
    friendRequest.responseDate = new Date();
    await friendRequest.save();

    const friendship1 = new Friends({
      user: friendRequest.sender,
      friend: friendRequest.receiver
    });

    const friendship2 = new Friends({
      user: friendRequest.receiver,
      friend: friendRequest.sender
    });

    await Promise.all([friendship1.save(), friendship2.save()]);

    await friendRequest.populate('sender', 'name email profilePicture');

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

const rejectFriendRequest = async (request, h) => {
  try {
    const { requestId } = request.params;
    const userId = request.auth.credentials.userId;

    const friendRequest = await FriendRequests.findById(requestId);
    if (!friendRequest) {
      return errorResponse(h, 'Friend request not found', 404);
    }

    if (friendRequest.receiver.toString() !== userId) {
      return errorResponse(h, 'Unauthorized', 403);
    }

    if (friendRequest.status !== 'pending') {
      return errorResponse(h, 'Friend request already processed', 400);
    }

    friendRequest.status = 'rejected';
    friendRequest.responseDate = new Date();
    await friendRequest.save();

    return successResponse(h, {}, 'Friend request rejected successfully');

  } catch (error) {
    console.error('Error rejecting friend request:', error);
    return errorResponse(h, 'Internal server error', 500);
  }
};

const getFriends = async (request, h) => {
  try {
    const { userId } = request.params;
    const currentUserId = request.auth.credentials.userId;

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

const removeFriend = async (request, h) => {
  try {
    const { friendId } = request.params;
    const userId = request.auth.credentials.userId;

    await Friends.deleteMany({
      $or: [
        { user: userId, friend: friendId },
        { user: friendId, friend: userId }
      ]
    });

    const existingRequest = await FriendRequests.findOne({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId }
      ]
    });

    if (existingRequest) {
      await FriendRequests.deleteOne({ _id: existingRequest._id });
    }

    const newFriendRequest = new FriendRequests({
      sender: userId,
      receiver: friendId,
      status: 'pending',
      requestDate: new Date(),
      responseDate: undefined
    });

    await newFriendRequest.save();
    await newFriendRequest.populate([
      { path: 'sender', select: 'name email profilePicture' },
      { path: 'receiver', select: 'name email profilePicture' }
    ]);

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

    const io = request.server.plugins.socket.io;
    
    io.to(friendId).emit('friendRequestReceived', {
      requestId: newFriendRequest._id,
      sender: newFriendRequest.sender,
      message: 'You have a new friend request!'
    });

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

const checkFriendshipStatus = async (request, h) => {
  try {
    const { userId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    const friendship = await Friends.findOne({
      $or: [
        { user: currentUserId, friend: userId },
        { user: userId, friend: currentUserId }
      ]
    });

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
