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
   
    
    // Handle both single file and array of files
    const filesToProcess = Array.isArray(mediaFiles) ? mediaFiles : (mediaFiles ? [mediaFiles] : []);
   
    if (filesToProcess.length > 0) {
      for (const file of filesToProcess) {
        try {
         
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
    const payload = request.payload;

   

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
    if (payload.content !== undefined) {
      if (!payload.content || payload.content.trim().length === 0) {
        return errorResponse(h, 'Post content is required', 400);
      }
      updateData.content = payload.content.trim();
    }
    if (payload.visibility !== undefined) {
      updateData.visibility = payload.visibility;
    }

    // Handle media removal
    let currentMedia = [...post.media];
    
    // Extract mediaToRemove from FormData
    const mediaToRemoveArray = [];
    
    // Check if mediaToRemove is sent as array in FormData
    for (const key in payload) {
      if (key.startsWith('mediaToRemove[') && payload[key]) {
        const mediaId = payload[key];
        if (typeof mediaId === 'string') {
          mediaToRemoveArray.push(mediaId);
        }
      }
    }
    
    if (payload.mediaToRemove) {
      if (typeof payload.mediaToRemove === 'string') {
        try {
          const parsed = JSON.parse(payload.mediaToRemove);
          if (Array.isArray(parsed)) {
            mediaToRemoveArray.push(...parsed);
          }
        } catch (e) {
          // If it's not JSON, treat as single ID
          mediaToRemoveArray.push(payload.mediaToRemove);
        }
      } else if (Array.isArray(payload.mediaToRemove)) {
        mediaToRemoveArray.push(...payload.mediaToRemove);
      }
    }
    
    if (mediaToRemoveArray.length > 0) {
      currentMedia = currentMedia.filter(mediaId => 
        !mediaToRemoveArray.some(removeId => removeId.toString() == mediaId.toString())
      );
      for (const mediaId of mediaToRemoveArray) {
        try {
          const storageRecord = await Storage.findById(mediaId);
          if (storageRecord) {
            // Delete physical file
            const filePath = path.join(__dirname, '..', storageRecord.path);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            // Delete storage record
            await Storage.findByIdAndDelete(mediaId);
          }
        } catch (error) {
          console.error('Error removing media file:', error);
          // Continue with other files even if one fails
        }
      }
    }

    // Handle new media files
    const newMediaRecords = [];
    
    // Extract newMediaFiles from FormData
    if (payload.newMediaFiles) {
      let filesToProcess = [];
      
      if (Array.isArray(payload.newMediaFiles)) {
        filesToProcess = payload.newMediaFiles;
      } else if (payload.newMediaFiles._data || payload.newMediaFiles.buffer) {
        // Single file
        filesToProcess = [payload.newMediaFiles];
      } else {
        // Check if there are multiple newMediaFiles entries in FormData
        for (const key in payload) {
          if (key.startsWith('newMediaFiles[') && payload[key] && (payload[key]._data || payload[key].buffer)) {
            filesToProcess.push(payload[key]);
          }
        }
      }
      
    
      for (const file of filesToProcess) {
        try {
          const storageRecord = await saveFileAndCreateRecord(file, userId);
          newMediaRecords.push(storageRecord._id);
        } catch (error) {
          console.error('Error processing new media file:', error);
          // Continue with other files even if one fails
        }
      }
    }

    // Combine existing media (after removal) with new media
    updateData.media = [...currentMedia, ...newMediaRecords];
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

 
    if (!mediaFiles) {
      return errorResponse(h, 'No media files provided', 400);
    }

    // Handle both single file and array of files
    const filesToProcess = Array.isArray(mediaFiles) ? mediaFiles : [mediaFiles];
 
    const mediaRecords = [];
    for (const file of filesToProcess) {
      try {
          
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
