const Posts = require('../models/Posts');
const Likes = require('../models/Likes');
const Storage = require('../models/Storage');
const { successResponse, errorResponse } = require('../common/response');
const { parsePaginationParams, paginate } = require('../common/pagination');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');


const generateUniqueFilename = (originalName) => {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(16).toString('hex');
  const uniqueFilename = `${timestamp}_${randomString}${ext}`;
  console.log('Generating filename:', { originalName, ext, uniqueFilename });
  return uniqueFilename;
};

const saveFileAndCreateRecord = async (file, userId) => {
  try {
    const uploadsDir = path.join(__dirname, '../uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Handle different file structures from frontend
    let fileBuffer, originalName, mimeType;
    
  
    if (file._data) {
      // Hapi.js file upload structure
      fileBuffer = file._data;
      // Extract filename and MIME type from hapi headers
      if (file.hapi && file.hapi.filename) {
        originalName = file.hapi.filename;
      } else {
        originalName = file.originalname || file.name || 'unknown';
      }
      
      if (file.hapi && file.hapi.headers && file.hapi.headers['content-type']) {
        mimeType = file.hapi.headers['content-type'];
      } else {
        mimeType = file.type || file.mimetype || 'application/octet-stream';
      }
    } else if (file.buffer) {
      // Buffer data (from form-data)
      fileBuffer = file.buffer;
      originalName = file.originalname || file.name || 'unknown';
      mimeType = file.mimetype || 'application/octet-stream';
    } else {
      throw new Error('Invalid file format');
    }

  

    const uniqueFilename = generateUniqueFilename(originalName);
    const filePath = path.join(uploadsDir, uniqueFilename);
    
    // Save file to filesystem
    fs.writeFileSync(filePath, fileBuffer);
   
    const storageData = {
      filename: uniqueFilename,
      originalName: originalName,
      mimeType: mimeType,
      size: fileBuffer.length,
      path: `/uploads/${uniqueFilename}`, 
      fileType: mimeType.startsWith('image/') ? 'image' : 
                mimeType.startsWith('video/') ? 'video' : 'document',
      uploadedBy: userId
    };

    const savedStorage = await Storage.create(storageData);
    return savedStorage;
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
};


const getAllPosts = async (request, h) => {
  try {
    const paginationParams = parsePaginationParams(request.query);
    
    const query = Posts.find()
      .populate([
        {
          path: 'author',
          select: 'name email profilePicture'
        },
        {
          path: 'media',
          select: 'filename originalName mimeType size path fileType'
        }
      ])
      .sort({ createdAt: -1 });

    const result = await paginate(query, paginationParams);
    
    // Populate likes for each post
    const postsWithLikes = await Promise.all(
      result.data.map(async (post) => {
        const likes = await Likes.find({ post: post._id })
          .populate('user', 'name profilePicture')
          .sort({ likedAt: -1 });
        
        return {
          ...post.toObject(),
          likes: likes,
          likesCount: likes.length
        };
      })
    );
    
    return successResponse(h, {
      posts: postsWithLikes,
      pagination: result.pagination
    }, 'Posts retrieved successfully');
  } catch (error) {
    console.error('Get all posts error:', error);
    return errorResponse(h, 'Failed to retrieve posts', 500);
  }
};

const getPostById = async (request, h) => {
  try {
    const { postId } = request.params;
    
    const post = await Posts.findById(postId)
      .populate('author', 'name email profilePicture')
      .populate('media', 'filename originalName mimeType size path fileType');

    if (!post) {
      return errorResponse(h, 'Post not found', 404);
    }

    // Get likes for the post
    const likes = await Likes.find({ post: postId })
      .populate('user', 'name profilePicture')
      .sort({ likedAt: -1 });

    // Add likes to post object
    const postWithLikes = {
      ...post.toObject(),
      likes: likes,
      likesCount: likes.length
    };

    return successResponse(h, 'Post retrieved successfully', postWithLikes);
  } catch (error) {
    console.error('Get post error:', error);
    return errorResponse(h, 'Failed to retrieve post', 500);
  }
};

// Create new post
const createPost = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const payload = request.payload;
    
    // Extract form data
    const content = payload.content;
    const visibility = payload.visibility || 'public';
    const mediaFiles = payload.media || [];

    // Validate required fields
    if (!content || content.trim().length === 0) {
      return errorResponse(h, 'Post content is required', 400);
    }

    // Handle media files and create storage records
    const mediaStorageRecords = [];
    console.log('Media files received:', mediaFiles);
    
    // Handle both single file and array of files
    const filesToProcess = Array.isArray(mediaFiles) ? mediaFiles : (mediaFiles ? [mediaFiles] : []);
   
    if (filesToProcess.length > 0) {
      for (const file of filesToProcess) {
        try {
          console.log('Processing file:', file);
          const storageRecord = await saveFileAndCreateRecord(file, userId);
          mediaStorageRecords.push(storageRecord._id);
        } catch (error) {
          console.error('Error processing file:', error);
          // Continue with other files even if one fails
        }
      }
    }

    // Prepare post data with storage references
    const postData = {
      author: userId,
      content: content.trim(),
      visibility: visibility,
      media: mediaStorageRecords // Store array of Storage record IDs
    };

    // Create new post
    const newPost = await Posts.create(postData);
    
    // Populate the response with full media details
    await newPost.populate([
      {
        path: 'author',
        select: 'name email profilePicture'
      },
      {
        path: 'media',
        select: 'filename originalName mimeType size path fileType'
      }
    ]);

    return successResponse(h, 'Post created successfully', newPost, 201);
  } catch (error) {
    console.error('Create post error:', error);
    return errorResponse(h, 'Failed to create post', 500);
  }
};

// Update post
const updatePost = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const { postId } = request.params;
    const { content, visibility } = request.payload;

    // Find the post
    const post = await Posts.findById(postId);
    if (!post) {
      return errorResponse(h, 'Post not found', 404);
    }

    // Check if user is the author
    if (post.author.toString() !== userId) {
      return errorResponse(h, 'Not authorized to update this post', 403);
    }

    // Update post
    const updateData = {};
    if (content !== undefined) {
      if (!content || content.trim().length === 0) {
        return errorResponse(h, 'Post content is required', 400);
      }
      updateData.content = content.trim();
    }
    if (visibility !== undefined) {
      updateData.visibility = visibility;
    }

    updateData.updatedAt = new Date();

    const updatedPost = await Posts.findByIdAndUpdate(
      postId,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'author',
        select: 'name email profilePicture'
      },
      {
        path: 'media',
        select: 'filename originalName mimeType size path fileType'
      }
    ]);

    return successResponse(h, 'Post updated successfully', updatedPost);
  } catch (error) {
    console.error('Update post error:', error);
    return errorResponse(h, 'Failed to update post', 500);
  }
};

// Delete post
const deletePost = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const { postId } = request.params;

    // Find the post
    const post = await Posts.findById(postId);
    if (!post) {
      return errorResponse(h, 'Post not found', 404);
    }

    // Check if user is the author
    if (post.author.toString() !== userId) {
      return errorResponse(h, 'Not authorized to delete this post', 403);
    }

    // TODO: Clean up associated media files if needed

    // Delete the post
    await Posts.findByIdAndDelete(postId);

    return successResponse(h, 'Post deleted successfully');
  } catch (error) {
    console.error('Delete post error:', error);
    return errorResponse(h, 'Failed to delete post', 500);
  }
};

// Toggle like/unlike on post
const toggleLike = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const { postId } = request.params;

    // Find the post
    const post = await Posts.findById(postId);
    if (!post) {
      return errorResponse(h, 'Post not found', 404);
    }

    // Check if user already liked the post
    const existingLike = await Likes.findOne({
      user: userId,
      post: postId
    });

    if (existingLike) {
      // Remove like
      await Likes.deleteOne({ _id: existingLike._id });
    } else {
      // Add like
      await Likes.create({
        user: userId,
        post: postId,
        likedAt: new Date()
      });
    }

    // Get updated likes count and list
    const likes = await Likes.find({ post: postId })
      .populate('user', 'name profilePicture')
      .sort({ likedAt: -1 });

    return successResponse(h, 'Like status updated successfully', {
      liked: !existingLike,
      likesCount: likes.length,
      likes: likes
    });
  } catch (error) {
    console.error('Toggle like error:', error);
    return errorResponse(h, 'Failed to update like status', 500);
  }
};

// Get user's posts
const getUserPosts = async (request, h) => {
  try {
    const { userId } = request.params;
    const paginationParams = parsePaginationParams(request.query);

    const query = Posts.find({ author: userId })
      .populate([
        {
          path: 'author',
          select: 'name email profilePicture'
        },
        {
          path: 'media',
          select: 'filename originalName mimeType size path fileType'
        }
      ])
      .sort({ createdAt: -1 });

    const result = await paginate(query, paginationParams);
    
    // Get likes for each post
    const postsWithLikes = await Promise.all(
      result.data.map(async (post) => {
        const likes = await Likes.find({ post: post._id })
          .populate('user', 'name profilePicture')
          .sort({ likedAt: -1 });
        
        return {
          ...post.toObject(),
          likes: likes,
          likesCount: likes.length
        };
      })
    );
    
    return successResponse(h, 'User posts retrieved successfully', {
      posts: postsWithLikes,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get user posts error:', error);
    return errorResponse(h, 'Failed to retrieve user posts', 500);
  }
};

// Upload post media (standalone upload)
const uploadMedia = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const mediaFiles = request.payload.media;

    console.log('Upload media - files received:', mediaFiles);

    if (!mediaFiles) {
      return errorResponse(h, 'No media files provided', 400);
    }

    // Handle both single file and array of files
    const filesToProcess = Array.isArray(mediaFiles) ? mediaFiles : [mediaFiles];
    console.log('Upload media - files to process:', filesToProcess.length);

    const mediaRecords = [];
    for (const file of filesToProcess) {
      try {
        console.log('Upload media - processing file:', file);
        const storageRecord = await saveFileAndCreateRecord(file, userId);
        mediaRecords.push(storageRecord);
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }

    return successResponse(h, 'Media uploaded successfully', mediaRecords, 201);
  } catch (error) {
    console.error('Upload media error:', error);
    return errorResponse(h, 'Failed to upload media', 500);
  }
};

// Share post
const sharePost = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const { postId } = request.params;
    const { shareText } = request.payload;

    // Find the post
    const post = await Posts.findById(postId);
    if (!post) {
      return errorResponse(h, 'Post not found', 404);
    }

    // TODO: Implement sharing logic (e.g., create share record, send notifications)
    
    return successResponse(h, 'Post shared successfully', {
      postId: postId,
      sharedBy: userId,
      shareText: shareText || '',
      sharedAt: new Date()
    });
  } catch (error) {
    console.error('Share post error:', error);
    return errorResponse(h, 'Failed to share post', 500);
  }
};

// Get likes for post
const getPostLikes = async (request, h) => {
  try {
    const { postId } = request.params;

    // Check if post exists
    const post = await Posts.findById(postId);
    if (!post) {
      return errorResponse(h, 'Post not found', 404);
    }

    // Get likes for the post
    const likes = await Likes.find({ post: postId })
      .populate('user', 'name profilePicture')
      .sort({ likedAt: -1 });

    return successResponse(h, 'Post likes retrieved successfully', {
      postId: postId,
      likesCount: likes.length,
      likes: likes
    });
  } catch (error) {
    console.error('Get post likes error:', error);
    return errorResponse(h, 'Failed to retrieve post likes', 500);
  }
};

module.exports = {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  toggleLike,
  getUserPosts,
  uploadMedia,
  sharePost,
  getPostLikes
};
