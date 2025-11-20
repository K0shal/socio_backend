const mongoose = require('mongoose');

const friendsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  friend: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  friendshipDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

// Ensure unique friendship pairs (user-friend combination)
friendsSchema.index({ user: 1, friend: 1 }, { unique: true });

module.exports = mongoose.model('Friends', friendsSchema);
