const { Conversations, Messages, User, Friends } = require('../models');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.onlineUsers = new Map();
    this._broadcastTimer = null;
    this._BROADCAST_DEBOUNCE_MS = 100;
    this.setupEventHandlers();
  }

  broadcastOnlineUsersDebounced() {
    if (this._broadcastTimer) clearTimeout(this._broadcastTimer);
    this._broadcastTimer = setTimeout(() => {
      try {
        const onlineUserIds = Array.from(this.onlineUsers.keys());
        this.io.emit('onlineUsersList', { userIds: onlineUserIds });
      } catch (err) {
        console.error('Error broadcasting online users:', err);
      } finally {
        this._broadcastTimer = null;
      }
    }, this._BROADCAST_DEBOUNCE_MS);
  }

  setupEventHandlers() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake?.auth?.token ?? socket.handshake?.query?.token;
        if (!token) return next(new Error('Authentication required'));
        let decoded;
        try {
          decoded = jwt.verify(token, config.JWT_SECRET);
        } catch {
          return next(new Error('Invalid token'));
        }
        if (!decoded?.userId) return next(new Error('Invalid token payload'));
        const user = await User.findById(decoded.userId).select('-password').lean();
        if (!user) return next(new Error('User not found'));
        socket.data.userId = String(user._id);
        socket.data.user = {
          id: String(user._id),
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture,
        };
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.data?.userId;
      const userInfo = socket.data?.user;
      if (!userId) {
        socket.disconnect(true);
        return;
      }
      socket.join(userId);
      
      // Check if this user is already online (multiple tabs/devices)
      const wasAlreadyOnline = this.onlineUsers.has(userId);
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId).add(socket.id);
      
      socket.emit('authenticated', { message: 'Authentication successful', user: userInfo });
      
      // Send current online users list to the newly connected user
      socket.emit('onlineUsersList', { userIds: Array.from(this.onlineUsers.keys()) });
      
      // Notify other users that this user is now online (only if they weren't already online)
      if (!wasAlreadyOnline) {
        socket.broadcast.emit('userOnline', { userId });
      }
      
      // Send individual userOnline events to the newly connected user for all currently online users
      // This ensures the new user sees everyone who is already online
      Array.from(this.onlineUsers.keys()).forEach(onlineUserId => {
        if (onlineUserId !== userId) {
          socket.emit('userOnline', { userId: onlineUserId });
        }
      });
      
      this.broadcastOnlineUsersDebounced();
      this.setupUserHandlers(socket);
      this.setupConversationHandlers(socket);
      this.setupMessageHandlers(socket);
      this.setupTypingHandlers(socket);
      this.setupFriendHandlers(socket);
      socket.on('disconnect', () => {
        const sId = socket.id;
        const socketsForUser = this.onlineUsers.get(userId);
        if (socketsForUser) {
          socketsForUser.delete(sId);
          if (socketsForUser.size === 0) {
            this.onlineUsers.delete(userId);
            this.io.emit('userOffline', { userId });
          }
          this.broadcastOnlineUsersDebounced();
        }
      });
    });
  }

  setupUserHandlers(socket) {
    socket.on('joinUser', (userId) => {
      if (!userId) return;
      socket.join(String(userId));
      socket.emit('joinedUserRoom', { userId: String(userId) });
    });
  }

  setupConversationHandlers(socket) {
    socket.on('joinConversation', async (data = {}) => {
      if (!socket.data?.userId) {
        socket.emit('error', { error: 'Authentication required' });
        return;
      }
      const convId = data.conversationId?.toString();
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
    });

    socket.on('leaveConversation', (data = {}) => {
      const convId = data.conversationId?.toString();
      if (convId) socket.leave(convId);
      socket.emit('leftConversation', { conversationId: convId });
    });
  }

  setupMessageHandlers(socket) {
    const friendshipCache = new Map();
    const CACHE_TTL = 30000;
    socket.on('sendMessage', async (data = {}, ack) => {
      if (!socket.data?.userId) {
        if (typeof ack === 'function') ack({ success: false, error: 'Authentication required' });
        socket.emit('messageError', { error: 'Authentication required' });
        return;
      }
      const { conversationId, senderId, content, messageType = 'text' } = data;
      const convId = conversationId?.toString();
      const sendId = senderId?.toString();
      if (!convId || !sendId) {
        if (typeof ack === 'function') ack({ success: false, error: 'Invalid payload' });
        socket.emit('messageError', { error: 'Invalid payload' });
        return;
      }
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
      const otherParticipant = (conversation.participants || []).find(
        (p) => String(p.user._id || p.user) !== String(sendId)
      );
      if (otherParticipant) {
        const pairKey = [sendId, String(otherParticipant.user._id || otherParticipant.user)].sort().join(':');
        let areFriends = false;
        const cached = friendshipCache.get(pairKey);
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
      await savedMessage.populate('sender', 'name email profilePicture');
      const messageObj = savedMessage.toObject();
      messageObj.conversation = convId.toString();
      this.io.to(convId.toString()).emit('newMessage', messageObj);
      (conversation.participants || []).forEach((participant) => {
        const participantId = String(participant.user._id || participant.user);
        if (participantId !== sendId) {
          this.io.to(participantId).emit('newMessageNotification', {
            conversationId: convId,
            message: messageObj,
          });
        }
      });
      if (typeof ack === 'function') ack({ success: true, message: messageObj });
    });

    socket.on('markAsRead', async (data = {}) => {
      if (!socket.data?.userId) {
        socket.emit('messageError', { error: 'Authentication required' });
        return;
      }
      const { messageId, conversationId } = data;
      if (!messageId) return;
      await Messages.findByIdAndUpdate(messageId, {
        $addToSet: { readBy: { user: socket.data.userId, readAt: new Date() } },
      });
      socket.to(conversationId.toString()).emit('messageRead', { messageId, userId: socket.data.userId });
    });
  }

  setupTypingHandlers(socket) {
    socket.on('typing', (data = {}) => {
      if (!socket.data?.userId) {
        socket.emit('messageError', { error: 'Authentication required' });
        return;
      }
      const { conversationId, userId, isTyping } = data;
      if (!conversationId) return;
      socket.to(conversationId.toString()).emit('userTyping', { userId, isTyping });
    });
  }

  setupFriendHandlers(socket) {
    socket.on('removeFriend', (data = {}) => {
      // To be implemented as needed
    });
  }
}

module.exports = SocketHandler;
