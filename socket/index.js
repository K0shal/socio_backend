// socket/index.js
const { Conversations, Messages, User, Friends } = require('../models/index');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

class SocketHandler {
  constructor(io) {
    this.io = io;
    // Map<userId, Set<socketId>>
    this.onlineUsers = new Map();
    this.setupEventHandlers();
  }

  // helper to broadcast the latest online user ids to everyone
  broadcastOnlineUsers() {
    try {
      const onlineUserIds = Array.from(this.onlineUsers.keys());
      this.io.emit('onlineUsersList', { userIds: onlineUserIds });
    } catch (err) {
      console.error('Error broadcasting online users:', err);
    }
  }

  setupEventHandlers() {
    // authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
        if (!token) return next(new Error('Authentication required'));

        const decoded = jwt.verify(token, config.JWT_SECRET);
        if (!decoded || !decoded.userId) return next(new Error('Invalid token payload'));

        const user = await User.findById(decoded.userId).select('-password').lean();
        if (!user) return next(new Error('User not found'));

        // Attach user to socket (use socket.data for compatibility)
        socket.data.userId = String(user._id);
        socket.data.user = {
          id: String(user._id),
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture,
        };

        return next();
      } catch (err) {
        // provide helpful message for client; avoid leaking sensitive info
        return next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      try {
        const userId = socket.data?.userId;
        const userInfo = socket.data?.user;

        if (!userId) {
          // this should not happen because middleware rejects unauthenticated sockets
          console.warn('[SOCKET] connection without userId (should be blocked by middleware)');
          socket.disconnect(true);
          return;
        }

        console.log('✅ [SOCKET] User connected:', userInfo?.email || userId, 'Socket ID:', socket.id);

        // Join personal room for direct notifications (useful for notifications)
        socket.join(userId);

        // Track online status (support multiple tabs/devices)
        if (!this.onlineUsers.has(userId)) {
          this.onlineUsers.set(userId, new Set());
        }
        this.onlineUsers.get(userId).add(socket.id);

        // Immediately send authentication confirmation to the connecting socket
        socket.emit('authenticated', {
          message: 'Authentication successful',
          user: userInfo,
        });

        // Broadcast presence events:
        // - Notify everyone that this user is online (userOnline)
        // - Broadcast updated online user list
        this.io.emit('userOnline', { userId });
        this.broadcastOnlineUsers();

        // Setup per-socket handlers
        this.setupUserHandlers(socket);
        this.setupConversationHandlers(socket);
        this.setupMessageHandlers(socket);
        this.setupTypingHandlers(socket);
        this.setupFriendHandlers(socket);

        socket.on('disconnect', () => {
          try {
            // remove socket id from map
            const sId = socket.id;
            if (!userId) return;

            const socketsForUser = this.onlineUsers.get(userId);
            if (socketsForUser) {
              socketsForUser.delete(sId);

              if (socketsForUser.size === 0) {
                this.onlineUsers.delete(userId);

                // Broadcast that user went offline
                this.io.emit('userOffline', { userId });
                this.broadcastOnlineUsers();
              } else {
                // update list even if still present (though same list)
                this.broadcastOnlineUsers();
              }
            }
            console.log('❌ [SOCKET] Disconnected:', userInfo?.email || userId, 'Socket ID:', sId);
          } catch (err) {
            console.error('Error during disconnect handling:', err);
          }
        });
      } catch (err) {
        console.error('Unhandled error in connection handler:', err);
      }
    });
  }

  setupUserHandlers(socket) {
    // optional: allow client to explicitly join rooms (backwards compatibility)
    socket.on('joinUser', (userId) => {
      try {
        if (!userId) return;
        socket.join(String(userId));
        // Optionally confirm
        socket.emit('joinedUserRoom', { userId: String(userId) });
      } catch (err) {
        console.error('joinUser error:', err);
      }
    });
  }

  setupConversationHandlers(socket) {
    socket.on('joinConversation', async (data) => {
      try {
        if (!socket.data?.userId) {
          socket.emit('error', { error: 'Authentication required' });
          return;
        }

        const { conversationId } = data || {};
        const convId = conversationId?.toString();
        if (!convId) {
          socket.emit('error', { error: 'Invalid conversationId' });
          return;
        }

        const conversation = await Conversations.findById(convId).lean();
        if (!conversation) {
          socket.emit('error', { error: 'Conversation not found' });
          return;
        }

        const isParticipant = (conversation.participants || []).some(
          (p) => String(p.user) === String(socket.data.userId)
        );

        if (!isParticipant) {
          socket.emit('error', { error: 'Unauthorized' });
          return;
        }

        // Optional: check friendship status (if your app requires friends to message)
        const otherParticipant = (conversation.participants || []).find(
          (p) => String(p.user) !== String(socket.data.userId)
        );

        if (otherParticipant) {
          const friendship = await Friends.findOne({
            $or: [
              { user: socket.data.userId, friend: otherParticipant.user },
              { user: otherParticipant.user, friend: socket.data.userId },
            ],
          }).lean();

          if (!friendship) {
            socket.emit('error', { error: 'You must be friends to join this conversation' });
            return;
          }
        }

        socket.join(convId);
        socket.emit('joinedConversation', { conversationId: convId });
      } catch (err) {
        console.error('Error joining conversation:', err);
        socket.emit('error', { error: 'Failed to join conversation' });
      }
    });

    socket.on('leaveConversation', (data) => {
      try {
        const convId = data?.conversationId?.toString();
        if (convId) socket.leave(convId);
        socket.emit('leftConversation', { conversationId: convId });
      } catch (err) {
        console.error('Error leaving conversation:', err);
      }
    });
  }

  setupMessageHandlers(socket) {
    // Simple in-memory friendship cache to reduce repeated DB calls per socket lifetime
    const friendshipCache = new Map();
    const CACHE_TTL = 30 * 1000; // 30s

    socket.on('sendMessage', async (data, ack) => {
      try {
        if (!socket.data?.userId) {
          if (typeof ack === 'function') ack({ success: false, error: 'Authentication required' });
          socket.emit('messageError', { error: 'Authentication required' });
          return;
        }

        const { conversationId, senderId, content, messageType = 'text' } = data || {};
        const convId = conversationId?.toString();
        const sendId = senderId?.toString();

        if (!convId || !sendId) {
          if (typeof ack === 'function') ack({ success: false, error: 'Invalid payload' });
          socket.emit('messageError', { error: 'Invalid payload' });
          return;
        }

        // load conversation and populate minimal sender info
        const conversation = await Conversations.findById(convId)
          .populate('participants.user', 'name email profilePicture')
          .lean();

        if (!conversation) {
          if (typeof ack === 'function') ack({ success: false, error: 'Conversation not found' });
          socket.emit('messageError', { error: 'Conversation not found' });
          return;
        }

        const isParticipant = (conversation.participants || []).some(
          (p) => String(p.user._id || p.user) === String(sendId)
        );

        if (!isParticipant) {
          if (typeof ack === 'function') ack({ success: false, error: 'Unauthorized' });
          socket.emit('messageError', { error: 'Unauthorized to send message in this conversation' });
          return;
        }

        // check friendship (with cache)
        const otherParticipant = (conversation.participants || []).find(
          (p) => String(p.user._id || p.user) !== String(sendId)
        );

        if (otherParticipant) {
          const pairKey = [sendId, String(otherParticipant.user._id || otherParticipant.user)].sort().join(':');
          const cached = friendshipCache.get(pairKey);
          let areFriends = false;

          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            areFriends = cached.status;
          } else {
            const friendship = await Friends.findOne({
              $or: [
                { user: sendId, friend: otherParticipant.user._id || otherParticipant.user },
                { user: otherParticipant.user._id || otherParticipant.user, friend: sendId },
              ],
            }).lean();
            areFriends = !!friendship;
            friendshipCache.set(pairKey, { status: areFriends, timestamp: Date.now() });
          }

          if (!areFriends) {
            if (typeof ack === 'function') ack({ success: false, error: 'You must be friends to send messages' });
            socket.emit('messageError', { error: 'You must be friends to send messages' });
            return;
          }
        }

        // create and save message
        const message = new Messages({
          conversation: convId,
          sender: sendId,
          content,
          messageType,
        });

        const [savedMessage] = await Promise.all([
          message.save(),
          Conversations.findByIdAndUpdate(
            convId,
            { lastMessage: message._id, lastMessageAt: new Date() },
            { lean: true }
          ),
        ]);

        // populate sender
        await savedMessage.populate('sender', 'name email profilePicture');

        const messageObj = savedMessage.toObject();
        messageObj.conversation = convId.toString();

        // emit to conversation room
        this.io.to(convId.toString()).emit('newMessage', messageObj);

        // notify other participants in their personal rooms
        (conversation.participants || []).forEach((participant) => {
          const participantId = String(participant.user._id || participant.user);
          if (participantId !== String(sendId)) {
            this.io.to(participantId).emit('newMessageNotification', {
              conversationId: convId,
              message: messageObj,
            });
          }
        });

        if (typeof ack === 'function') ack({ success: true, message: messageObj });
      } catch (err) {
        console.error('Error sending message:', err);
        try {
          socket.emit('messageError', { error: 'Failed to send message' });
          if (typeof ack === 'function') ack({ success: false, error: 'Failed to send message' });
        } catch (e) {
          console.error('Ack/send fallback error:', e);
        }
      }
    });

    socket.on('markAsRead', async (data) => {
      try {
        if (!socket.data?.userId) {
          socket.emit('messageError', { error: 'Authentication required' });
          return;
        }

        const { messageId, conversationId } = data || {};
        if (!messageId) return;

        await Messages.findByIdAndUpdate(messageId, {
          $addToSet: { readBy: { user: socket.data.userId, readAt: new Date() } },
        });

        socket.to(String(conversationId)).emit('messageRead', { messageId, userId: socket.data.userId });
      } catch (err) {
        console.error('Error marking message read:', err);
      }
    });
  }

  setupTypingHandlers(socket) {
    socket.on('typing', (data) => {
      try {
        if (!socket.data?.userId) {
          socket.emit('messageError', { error: 'Authentication required' });
          return;
        }

        const { conversationId, userId, isTyping } = data || {};
        if (!conversationId) return;

        // emit typing to the conversation room (except sender)
        socket.to(String(conversationId)).emit('userTyping', { userId, isTyping });
      } catch (err) {
        console.error('Typing handler error:', err);
      }
    });
  }

  setupFriendHandlers(socket) {
    // placeholder for friend-specific events (friend add/remove notifications, etc.)
    socket.on('removeFriend', (data) => {
      try {
        // implement as needed: validate, update DB, emit friendRemoved, etc.
      } catch (err) {
        console.error('removeFriend handler error:', err);
      }
    });
  }
}

module.exports = SocketHandler;
