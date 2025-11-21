const Joi = require('joi');
const chatController = require('../controllers/chatController');

const chatRoutes = [
  // Get or create conversation between two users
  {
    method: 'GET',
    path: '/api/chat/conversation/user/{userId}',
    handler: chatController.getOrCreateConversation,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          userId: Joi.string().required()
        })
      }
    }
  },

  // Get all conversations for current user
  {
    method: 'GET',
    path: '/api/chat/conversations',
    handler: chatController.getConversations,
    options: {
      auth: 'jwt',
      validate: {
        query: Joi.object({
          page: Joi.number().integer().min(1).default(1),
          limit: Joi.number().integer().min(1).max(50).default(20)
        })
      }
    }
  },

  // Get conversation by ID
  {
    method: 'GET',
    path: '/api/chat/conversation/{conversationId}',
    handler: chatController.getConversation,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          conversationId: Joi.string().required()
        })
      }
    }
  },

  // Get messages for a conversation
  {
    method: 'GET',
    path: '/api/chat/conversation/{conversationId}/messages',
    handler: chatController.getMessages,
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          conversationId: Joi.string().required()
        }),
        query: Joi.object({
          page: Joi.number().integer().min(1).default(1),
          limit: Joi.number().integer().min(1).max(100).default(50)
        })
      }
    }
  }
];

module.exports = chatRoutes;
