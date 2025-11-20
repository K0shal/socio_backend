// Import all models
const User = require('./User');
const Friends = require('./Friends');
const FriendRequests = require('./FriendRequests');
const Posts = require('./Posts');
const Storage = require('./Storage');
const Conversations = require('./Conversations');
const Messages = require('./Messages');
const Likes = require('./Likes');

// Export all models
module.exports = {
  User,
  Friends,
  FriendRequests,
  Posts,
  Storage,
  Conversations,
  Messages,
  Likes
};
