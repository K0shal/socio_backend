const { Conversations, Messages, User } = require('../models/index');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('User connected:', socket.id);
      
      // Handle authentication
      socket.on('authenticate', async (data) => {
        try {
          const { token } = data;
          
          if (!token) {
            socket.emit('authError', { error: 'Token is required' });
            return;
          }

          // Verify JWT token
          const decoded = jwt.verify(token, config.JWT_SECRET);
          
          // Get user details
          const user = await User.findById(decoded.userId).select('-password');
          
          if (!user) {
            socket.emit('authError', { error: 'User not found' });
            return;
          }

          // Attach user to socket and join their personal room
          socket.userId = user._id;
          socket.user = user;
          socket.join(user._id.toString());
          
          socket.emit('authenticated', { 
            message: 'Authentication successful',
            user: {
              id: user._id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              profilePicture: user.profilePicture
            }
          });
          
        
          
        } catch (error) {
          console.error('Socket authentication error:', error);
          socket.emit('authError', { error: 'Invalid token' });
        }
      });
      
      this.setupUserHandlers(socket);
      this.setupConversationHandlers(socket);
      this.setupMessageHandlers(socket);
      this.setupTypingHandlers(socket);
      this.setupFriendHandlers(socket);
      
      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
      });
    });
  }

  setupUserHandlers(socket) {
   
    socket.on('joinUser', (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined their personal room`);
    });
  }

  setupConversationHandlers(socket) {
   
  }

  setupMessageHandlers(socket) {
    socket.on('sendMessage', async (data) => {
      try {
        // Check if user is authenticated
        if (!socket.userId) {
          socket.emit('messageError', { error: 'Authentication required' });
          return;
        }

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
        this.io.to(conversationId).emit('newMessage', message);
        
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('messageError', { error: 'Failed to send message' });
      }
    });

    // Handle marking messages as read
    socket.on('markAsRead', async (data) => {
      try {
        // Check if user is authenticated
        if (!socket.userId) {
          socket.emit('messageError', { error: 'Authentication required' });
          return;
        }

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
  }

  setupTypingHandlers(socket) {
    // Handle typing indicators
    socket.on('typing', (data) => {
      // Check if user is authenticated
      if (!socket.userId) {
        socket.emit('messageError', { error: 'Authentication required' });
        return;
      }

      const { conversationId, userId, isTyping } = data;
      socket.to(conversationId).emit('userTyping', { userId, isTyping });
    });
  }

  setupFriendHandlers(socket) {
    // Friend request notifications are already handled in the controllers
    // This method can be used for additional friend-related socket events if needed
    console.log('Friend handlers setup completed');
  }
}

module.exports = SocketHandler;
