const Posts = require('../models/Posts');
const Likes = require('../models/Likes');
const Storage = require('../models/Storage');
const { successResponse, errorResponse } = require('../common/response');
const { parsePaginationParams, paginate } = require('../common/pagination');

// Get all posts with pagination
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
          select: 'url type filename'
        }
      ])
      .sort({ createdAt: -1 });

    const result = await paginate(query, paginationParams);
    

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
    },'Posts retrieved successfully');
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
      .populate('media', 'url type filename');

    if (!post) {
      return errorResponse(h, 'Post not found', 404);
    }

    // Get likes from separate Likes collection
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

    // Prepare post data
    const postData = {
      author: userId,
      content: content.trim(),
      visibility: visibility,
      media: []
    };

    // Handle media files
    if (mediaFiles && mediaFiles.length > 0) {
      const mediaPromises = mediaFiles.map(async (file) => {
        // Save media file and get reference
        const mediaData = {
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.headers['content-type'],
          size: file.length,
          url: `/uploads/${file.filename}`,
          type: file.headers['content-type'].startsWith('image/') ? 'image' : 'video',
          uploadedBy: userId
        };

        const savedMedia = await Storage.create(mediaData);
        return savedMedia._id;
      });

      postData.media = await Promise.all(mediaPromises);
    }

    // Create new post
    const newPost = await Posts.create(postData);
    
    // Populate the response
    await newPost.populate([
      {
        path: 'author',
        select: 'name email profilePicture'
      },
      {
        path: 'media',
        select: 'url type filename'
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
    ).populate('author', 'name email profilePicture');

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

    // Check if user already liked the post using the separate Likes collection
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
          select: 'url type filename'
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

// Upload post media
const uploadMedia = async (request, h) => {
  try {
    const userId = request.auth.credentials.userId;
    const mediaFiles = request.payload.media;

    if (!mediaFiles || mediaFiles.length === 0) {
      return errorResponse(h, 'No media files provided', 400);
    }

    const mediaPromises = mediaFiles.map(async (file) => {
      const mediaData = {
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.headers['content-type'],
        size: file.length,
        url: `/uploads/${file.filename}`,
        type: file.headers['content-type'].startsWith('image/') ? 'image' : 'video',
        uploadedBy: userId
      };

      return await Storage.create(mediaData);
    });

    const savedMedia = await Promise.all(mediaPromises);

    return successResponse(h, 'Media uploaded successfully', savedMedia, 201);
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

    // Here you would implement sharing logic (e.g., create share record, send notifications, etc.)
    // For now, just return success with share info
    
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

    // Get likes from separate Likes collection
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
