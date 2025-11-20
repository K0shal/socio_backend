require('dotenv').config();
const Hapi = require('@hapi/hapi');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/database');

// Import models
const User = require('./models/User');
const Friends = require('./models/Friends');
const FriendRequests = require('./models/FriendRequests');
const Posts = require('./models/Posts');
const Storage = require('./models/Storage');
const Conversations = require('./models/Conversations');
const Messages = require('./models/Messages');

const init = async () => {
  // Create Hapi server
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: 'localhost',
    routes: {
      cors: {
        origin: ['*'],
        headers: ['Accept', 'Authorization', 'Content-Type', 'If-None-Match', 'Accept-language']
      }
    }
  });

  // Create HTTP server for Socket.io
  const httpServer = http.createServer(server.listener);
  const io = socketIo(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Connect to database
  connectDB();

  // Basic routes
  server.route([
    {
      method: 'GET',
      path: '/',
      handler: (request, h) => {
        return {
          message: 'LinkedIn Clone API Server is running!',
          timestamp: new Date(),
          version: '1.0.0',
          framework: 'Hapi.js'
        };
      }
    },
    {
      method: 'GET',
      path: '/api/health',
      handler: (request, h) => {
        return {
          status: 'healthy',
          database: 'connected',
          timestamp: new Date()
        };
      }
    }
  ]);

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join user to their personal room for private messages
    socket.on('joinUser', (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined their personal room`);
    });

    // Join conversation room
    socket.on('joinConversation', (conversationId) => {
      socket.join(conversationId);
      console.log(`User ${socket.id} joined conversation ${conversationId}`);
    });

    // Handle sending messages
    socket.on('sendMessage', async (data) => {
      try {
        const { conversationId, senderId, content, messageType = 'text' } = data;
        
        // Create new message
        const message = new Messages({
          conversation: conversationId,
          sender: senderId,
          content,
          messageType
        });
        
        await message.save();
        
        // Update conversation's last message
        await Conversations.findByIdAndUpdate(
          conversationId,
          {
            lastMessage: message._id,
            lastMessageAt: new Date()
          }
        );

        // Populate message details
        await message.populate('sender', 'username firstName lastName profilePicture');
        
        // Broadcast message to conversation room
        io.to(conversationId).emit('newMessage', message);
        
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('messageError', { error: 'Failed to send message' });
      }
    });

    // Handle marking messages as read
    socket.on('markAsRead', async (data) => {
      try {
        const { messageId, userId } = data;
        
        await Messages.findByIdAndUpdate(
          messageId,
          {
            $addToSet: {
              readBy: { user: userId, readAt: new Date() }
            }
          }
        );

        // Notify other participants that message was read
        socket.to(data.conversationId).emit('messageRead', { messageId, userId });
        
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
      const { conversationId, userId, isTyping } = data;
      socket.to(conversationId).emit('userTyping', { userId, isTyping });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  // Start the HTTP server with Socket.io
  await httpServer.listen(server.info.port);
  console.log(`LinkedIn Clone Server running on port ${server.info.port}`);
  console.log(`HTTP Server: http://localhost:${server.info.port}`);
  console.log(`Socket.IO Server: ws://localhost:${server.info.port}`);
  console.log(`Framework: Hapi.js`);

  return server;
};

init().catch(err => {
  console.error('Error starting server:', err);
  process.exit(1);
});

module.exports = init;
