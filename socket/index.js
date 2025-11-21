const { Conversations, Messages, User, Friends } = require('../models/index');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.onlineUsers = new Map(); // Map of userId -> Set of socketIds
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Add authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, config.JWT_SECRET);
        
        // Get user details
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
          return next(new Error('User not found'));
        }

        // Attach user to socket
        socket.userId = user._id;
        socket.user = user;
        
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log('✅ [SOCKET] User connected:', socket.user.email, 'Socket ID:', socket.id);
      
      // Join their personal room
      socket.join(socket.user._id.toString());
      
      // Track online status
      if (!this.onlineUsers.has(socket.user._id.toString())) {
        this.onlineUsers.set(socket.user._id.toString(), new Set());
      }
      this.onlineUsers.get(socket.user._id.toString()).add(socket.id);
      
      // Emit online status to all (friends will filter on frontend)
      // Also send list of currently online users to the newly connected user
      const onlineUserIds = Array.from(this.onlineUsers.keys());
   
      socket.emit('onlineUsersList', { userIds: onlineUserIds });
      
      // Emit online status to all users
      this.io.emit('userOnline', { userId: socket.user._id.toString() });
      
      socket.emit('authenticated', { 
        message: 'Authentication successful',
        user: {
          id: socket.user._id,
          email: socket.user.email,
          name: socket.user.name,
          profilePicture: socket.user.profilePicture
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

        // Check if participants are still friends
        const otherParticipant = conversation.participants.find(
          p => p.user.toString() !== socket.userId.toString()
        );
        
        if (otherParticipant) {
          const friendship = await Friends.findOne({
            $or: [
              { user: socket.userId, friend: otherParticipant.user },
              { user: otherParticipant.user, friend: socket.userId }
            ]
          });

          if (!friendship) {
            socket.emit('error', { error: 'You must be friends to join this conversation' });
            return;
          }
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
    // Cache for friendship status to reduce DB queries
    const friendshipCache = new Map();
    const CACHE_TTL = 30000; // 30 seconds

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
        
        // Verify user is part of conversation (optimized query with lean)
        const conversation = await Conversations.findById(convId)
          .populate('participants.user', 'name email profilePicture')
          .lean();
        
        if (!conversation) {
          socket.emit('messageError', { error: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(
          p => p.user._id.toString() === sendId.toString()
        );

        if (!isParticipant) {
          socket.emit('messageError', { error: 'Unauthorized to send message in this conversation' });
          return;
        }

        // Check if participants are still friends (with caching)
        const otherParticipant = conversation.participants.find(
          p => p.user._id.toString() !== sendId.toString()
        );
        
        if (otherParticipant) {
          const cacheKey = [sendId, otherParticipant.user._id.toString()].sort().join(':');
          const cached = friendshipCache.get(cacheKey);
          
          let areFriends = false;
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            areFriends = cached.status;
          } else {
            // Optimized friendship query with lean
            const friendship = await Friends.findOne({
              $or: [
                { user: sendId, friend: otherParticipant.user._id },
                { user: otherParticipant.user._id, friend: sendId }
              ]
            }).lean();
            
            areFriends = !!friendship;
            friendshipCache.set(cacheKey, {
              status: areFriends,
              timestamp: Date.now()
            });
          }

          if (!areFriends) {
            socket.emit('messageError', { error: 'You must be friends to send messages' });
            return;
          }
        }
        
        // Create new message with optimized save
        const message = new Messages({
          conversation: convId,
          sender: sendId,
          content,
          messageType
        });
        
        // Save message and update conversation in parallel for better performance
        const [savedMessage] = await Promise.all([
          message.save(),
          Conversations.findByIdAndUpdate(
            convId,
            {
              lastMessage: message._id,
              lastMessageAt: new Date()
            },
            { lean: true }
          )
        ]);

        // Populate message details efficiently
        await savedMessage.populate('sender', 'name email profilePicture');
        
        // Convert message to plain object for socket emission
        const messageObj = savedMessage.toObject();
        messageObj.conversation = convId.toString();
        
        // Emit to conversation room
        this.io.to(convId.toString()).emit('newMessage', messageObj);
        
        // Emit to other participant's personal room for notifications
        conversation.participants.forEach(participant => {
          if (participant.user._id.toString() !== sendId.toString()) {
            this.io.to(participant.user._id.toString()).emit('newMessageNotification', {
              conversationId: convId,
              message: messageObj
            });
          }
        });
        
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
