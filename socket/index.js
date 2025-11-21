const { Conversations, Messages, User } = require('../models/index');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.onlineUsers = new Map(); // Map of userId -> Set of socketIds
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
     
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
          
          // Track online status
          if (!this.onlineUsers.has(user._id.toString())) {
            this.onlineUsers.set(user._id.toString(), new Set());
          }
          this.onlineUsers.get(user._id.toString()).add(socket.id);
          
          // Emit online status to all (friends will filter on frontend)
          // Also send list of currently online users to the newly connected user
          const onlineUserIds = Array.from(this.onlineUsers.keys());
       
          socket.emit('onlineUsersList', { userIds: onlineUserIds });
          
          // Emit online status to all users
         
          this.io.emit('userOnline', { userId: user._id.toString() });
          
         
          socket.emit('authenticated', { 
            message: 'Authentication successful',
            user: {
              id: user._id,
              email: user.email,
              name: user.name,
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
        
        // Handle offline status
        if (socket.userId) {
          const userId = socket.userId.toString();
          const userSockets = this.onlineUsers.get(userId);
          
          if (userSockets) {
            userSockets.delete(socket.id);
            
            // If no more sockets for this user, mark as offline
            if (userSockets.size === 0) {
              this.onlineUsers.delete(userId);
       
              this.io.emit('userOffline', { userId });
            }
          }
        }
      });
    });
  }

  setupUserHandlers(socket) {
   
    socket.on('joinUser', (userId) => {
      socket.join(userId);
   
    });
  }

  setupConversationHandlers(socket) {
    // Join conversation room
    socket.on('joinConversation', async (data) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { error: 'Authentication required' });
          return;
        }

        const { conversationId } = data;
        const convId = conversationId?.toString() || conversationId;
        
        // Verify user is part of conversation
        const conversation = await Conversations.findById(convId);
        if (!conversation) {
          socket.emit('error', { error: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(
          p => p.user.toString() === socket.userId.toString()
        );

        if (!isParticipant) {
          socket.emit('error', { error: 'Unauthorized' });
          return;
        }

        socket.join(convId.toString());
       
        
        // Confirm join to client
        socket.emit('joinedConversation', { conversationId: convId.toString() });
      } catch (error) {
        console.error('Error joining conversation:', error);
        socket.emit('error', { error: 'Failed to join conversation' });
      }
    });

    // Leave conversation room
    socket.on('leaveConversation', (data) => {
      const { conversationId } = data;
      const convId = conversationId?.toString() || conversationId;
      socket.leave(convId.toString());
    
    });
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
        const convId = conversationId?.toString() || conversationId;
        const sendId = senderId?.toString() || senderId;
        
        // Create new message
        const message = new Messages({
          conversation: convId,
          sender: sendId,
          content,
          messageType
        });
        
        await message.save();
        
        // Update conversation's last message
        await Conversations.findByIdAndUpdate(
          convId,
          {
            lastMessage: message._id,
            lastMessageAt: new Date()
          }
        );

        // Populate message details
        await message.populate('sender', 'name email profilePicture');
        
        // Convert message to plain object for socket emission
        const messageObj = message.toObject();
        // Ensure conversation ID is included as string for frontend comparison
        messageObj.conversation = convId.toString();
        
  
        this.io.to(convId.toString()).emit('newMessage', messageObj);
        
        // Also emit to participants' personal rooms for notifications
        const conversation = await Conversations.findById(convId);
        if (conversation) {
          conversation.participants.forEach(participant => {
            if (participant.user.toString() !== sendId.toString()) {
              this.io.to(participant.user.toString()).emit('newMessageNotification', {
                conversationId: convId,
                message: messageObj
              });
            }
          });
        }
        
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
      const convId = conversationId?.toString() || conversationId;
      socket.to(convId).emit('userTyping', { userId, isTyping });
    });
  }

  setupFriendHandlers(socket) {
   
  }
}

module.exports = SocketHandler;
