const mongoose = require('mongoose');

const likesSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Posts',
    required: true
  },
  likedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure a user can only like a post once
likesSchema.index({ user: 1, post: 1 }, { unique: true });

// Indexes for better query performance
likesSchema.index({ post: 1 });
likesSchema.index({ user: 1 });

module.exports = mongoose.model('Likes', likesSchema);
