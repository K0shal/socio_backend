const { Conversations, Messages, User, Friends } = require('../models/index');
const Joi = require('joi');

// Get or create conversation between two users
const getOrCreateConversation = async (request, h) => {
  try {
    const { userId: otherUserId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    // Validate input
    const schema = Joi.object({
      userId: Joi.string().required()
    });

    const { error } = schema.validate({ userId: otherUserId });
    if (error) {
      return h.response({ error: error.details[0].message }).code(400);
    }

    // Check if trying to chat with self
    if (currentUserId.toString() === otherUserId) {
      return h.response({ error: 'Cannot create conversation with yourself' }).code(400);
    }

    // Check if they are friends
    const friendship = await Friends.findOne({
      $or: [
        { user: currentUserId, friend: otherUserId },
        { user: otherUserId, friend: currentUserId }
      ]
    });

    if (!friendship) {
      return h.response({ error: 'You must be friends to start a conversation' }).code(403);
    }

    // Check if conversation already exists
    // Find conversations where both users are participants
    const conversations = await Conversations.find({
      'participants.user': { $all: [currentUserId, otherUserId] },
      isActive: true
    }).populate('participants.user', 'name email profilePicture')
      .populate('lastMessage');
    
    // Filter to ensure it has exactly 2 participants (one-on-one chat)
    let conversation = conversations.find(conv => conv.participants.length === 2);

    // If conversation doesn't exist, create it
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

    // Get the other participant
    const otherParticipant = conversation.participants.find(
      p => p.user._id.toString() !== currentUserId.toString()
    );

    return h.response({
      conversation: {
        ...conversation.toObject(),
        otherUser: otherParticipant?.user || null
      },
      message: 'Conversation retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting or creating conversation:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// Get all conversations for current user
const getConversations = async (request, h) => {
  try {
    const currentUserId = request.auth.credentials.userId;

    const conversations = await Conversations.find({
      'participants.user': currentUserId,
      isActive: true
    })
      .populate('participants.user', 'name email profilePicture')
      .populate('lastMessage')
      .lean() // Use lean for better performance
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    // Get other participant for each conversation (optimized)
    const conversationsWithOtherUser = conversations.map(conv => {
      const otherParticipant = conv.participants.find(
        p => p.user._id.toString() !== currentUserId.toString()
      );
      return {
        ...conv,
        otherUser: otherParticipant?.user || null
      };
    });

    return h.response({
      conversations: conversationsWithOtherUser,
      count: conversationsWithOtherUser.length
    });

  } catch (error) {
    console.error('Error getting conversations:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// Get messages for a conversation
const getMessages = async (request, h) => {
  try {
    const { conversationId } = request.params;
    const currentUserId = request.auth.credentials.userId;
    const { page = 1, limit = 50 } = request.query;

    // Validate input
    const schema = Joi.object({
      conversationId: Joi.string().required()
    });

    const { error } = schema.validate({ conversationId });
    if (error) {
      return h.response({ error: error.details[0].message }).code(400);
    }

    // Use lean() for better performance and check user participation in one query
    const conversation = await Conversations.findById(conversationId)
      .populate('participants.user', 'name email profilePicture')
      .lean();

    if (!conversation) {
      return h.response({ error: 'Conversation not found' }).code(404);
    }

    const isParticipant = conversation.participants.some(
      p => p.user._id.toString() === currentUserId.toString()
    );

    if (!isParticipant) {
      return h.response({ error: 'Unauthorized' }).code(403);
    }

    // Get messages with lean() for better performance
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [messages, total] = await Promise.all([
      Messages.find({
        conversation: conversationId,
        isDeleted: false
      })
        .populate('sender', 'name email profilePicture')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Messages.countDocuments({ conversation: conversationId, isDeleted: false })
    ]);

    // Update last read timestamp for current user (optimized)
    await Conversations.updateOne(
      {
        _id: conversationId,
        'participants.user': currentUserId
      },
      {
        $set: {
          'participants.$.lastRead': new Date()
        }
      }
    );

    return h.response({
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }
    });

  } catch (error) {
    console.error('Error getting messages:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

// Get conversation by ID
const getConversation = async (request, h) => {
  try {
    const { conversationId } = request.params;
    const currentUserId = request.auth.credentials.userId;

    const conversation = await Conversations.findById(conversationId)
      .populate('participants.user', 'name email profilePicture')
      .populate('lastMessage');

    if (!conversation) {
      return h.response({ error: 'Conversation not found' }).code(404);
    }

    // Check if user is part of the conversation
    const isParticipant = conversation.participants.some(
      p => p.user._id.toString() === currentUserId.toString()
    );

    if (!isParticipant) {
      return h.response({ error: 'Unauthorized' }).code(403);
    }

    // Get the other participant
    const otherParticipant = conversation.participants.find(
      p => p.user._id.toString() !== currentUserId.toString()
    );

    return h.response({
      conversation: {
        ...conversation.toObject(),
        otherUser: otherParticipant?.user || null
      }
    });

  } catch (error) {
    console.error('Error getting conversation:', error);
    return h.response({ error: 'Internal server error' }).code(500);
  }
};

module.exports = {
  getOrCreateConversation,
  getConversations,
  getMessages,
  getConversation
};
