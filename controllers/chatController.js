const { Conversations, Messages, User, Friends } = require('../models/index');
const Joi = require('joi');
const mongoose = require('mongoose');

// Helper: check if user is online
const isUserOnline = (userId) => {
  if (!global.onlineUsers) return false;
  return global.onlineUsers.has(userId.toString());
};

// -------------------------------
// Get or Create Conversation
// -------------------------------
const getOrCreateConversation = async (request, h) => {
  try {
    const { userId: otherUserId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    // Validation
    const { error } = Joi.object({ userId: Joi.string().required() })
      .validate({ userId: otherUserId });

    if (error) return h.response({ error: error.details[0].message }).code(400);

    if (currentUserId.toString() === otherUserId)
      return h.response({ error: 'Cannot create conversation with yourself' }).code(400);

    // Must be friends
    const friendship = await Friends.findOne({
      $or: [
        { user: currentUserId, friend: otherUserId },
        { user: otherUserId, friend: currentUserId }
      ]
    });

    if (!friendship)
      return h.response({ error: 'You must be friends to start a conversation' }).code(403);

    // Check if conversation exists
    let conversation = await Conversations.findOne({
      'participants.user': { $all: [currentUserId, otherUserId] },
      isActive: true
    })
      .populate('participants.user', 'name email profilePicture')
      .populate('lastMessage');

    if (!conversation) {
      conversation = new Conversations({
        participants: [
          { user: currentUserId },
          { user: otherUserId }
        ],
        createdBy: currentUserId
      });

      await conversation.save();
      await conversation.populate('participants.user', 'name email profilePicture');
    }

    const otherParticipant = conversation.participants.find(
      p => p.user._id.toString() !== currentUserId.toString()
    );

    // ADD ONLINE FLAG HERE
    const otherUser = {
      ...otherParticipant.user.toObject(),
      isOnline: isUserOnline(otherParticipant.user._id)
    };

    return h.response({
      conversation: {
        ...conversation.toObject(),
        otherUser
      }
    });

  } catch (err) {
    console.error('Get/Create conversation error:', err);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// -------------------------------
// Get All Conversations
// -------------------------------
const getConversations = async (request, h) => {
  try {
    const currentUserId = request.auth.credentials.userId;
    const { page = 1, limit = 20 } = request.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const conversations = await Conversations.find({
      'participants.user': currentUserId,
      isActive: true
    })
      .populate('participants.user', 'name email profilePicture')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    // Add online flags
    const result = conversations.map(conv => {
      const other = conv.participants.find(
        p => p.user._id.toString() !== currentUserId.toString()
      );

      return {
        ...conv,
        otherUser: {
          ...other.user,
          isOnline: isUserOnline(other.user._id)
        }
      };
    });

    const total = await Conversations.countDocuments({
      'participants.user': currentUserId,
      isActive: true
    });

    return h.response({
      conversations: result,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error('Get conversations error:', err);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// -------------------------------
// Get Messages
// -------------------------------
const getMessages = async (request, h) => {
  try {
    const { conversationId } = request.params;
    const currentUserId = request.auth.credentials.userId;
    const { page = 1, limit = 30 } = request.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const conversation = await Conversations.findOne({
      _id: conversationId,
      'participants.user': currentUserId,
      isActive: true
    });

    if (!conversation)
      return h.response({ error: 'Unauthorized or not found' }).code(404);

    const messages = await Messages.find({
      conversation: conversationId,
      isDeleted: false
    })
      .populate('sender', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const total = await Messages.countDocuments({
      conversation: conversationId,
      isDeleted: false
    });

    return h.response({
      messages: messages.reverse(),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error('Get messages error:', err);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// -------------------------------
// Get Conversation by ID
// -------------------------------
const getConversation = async (request, h) => {
  try {
    const { conversationId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    const conversation = await Conversations.findById(conversationId)
      .populate('participants.user', 'name email profilePicture')
      .populate('lastMessage')
      .lean();

    if (!conversation) return h.response({ error: 'Not found' }).code(404);

    const other = conversation.participants.find(
      p => p.user._id.toString() !== currentUserId.toString()
    );

    return h.response({
      conversation: {
        ...conversation,
        otherUser: {
          ...other.user,
          isOnline: isUserOnline(other.user._id)
        }
      }
    });

  } catch (err) {
    console.error('Get conversation error:', err);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

module.exports = {
  getOrCreateConversation,
  getConversations,
  getMessages,
  getConversation
};
