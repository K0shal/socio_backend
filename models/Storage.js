const mongoose = require('mongoose');

const storageSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileType: {
    type: String,
    enum: ['image', 'video', 'document'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

storageSchema.virtual('url').get(function() {
  const backendUrl = process.env.BACKEND_URL;
  return `${backendUrl}${this.path}`;
});

// Ensure virtuals are included in JSON output
storageSchema.set('toJSON', { virtuals: true });
storageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Storage', storageSchema);
