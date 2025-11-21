const postController = require('../controllers/postsController');

const routes = [
 
  {
    method: 'GET',
    path: '/api/posts',
    handler: postController.getAllPosts,
    options: {
      auth: false,
    }
  },

 
  {
    method: 'GET',
    path: '/api/posts/{postId}',
    handler: postController.getPostById,
    options: {
      auth: false,
    }
  },

  {
    method: 'POST',
    path: '/api/posts',
    handler: postController.createPost,
    options: {
      auth: 'jwt',
      payload: {
        multipart: true,
        output: 'stream',
        parse: true,
        maxBytes: 50 * 1024 * 1024, // 50MB to match frontend
      },
    }
  },

  // Update post
  {
    method: 'PUT',
    path: '/api/posts/{postId}',
    handler: postController.updatePost,
    options: {
      auth: 'jwt',
      payload: {
        multipart: true,
        output: 'stream',
        parse: true,
        maxBytes: 50 * 1024 * 1024, // 50MB to match frontend
      },
    }
  },

  // Delete post
  {
    method: 'DELETE',
    path: '/api/posts/{postId}',
    handler: postController.deletePost,
    options: {
      auth: 'jwt',
    }
  },

  // Like/unlike post
  {
    method: 'POST',
    path: '/api/posts/{postId}/like',
    handler: postController.toggleLike,
    options: {
      auth: 'jwt',
    }
  },

  // Get user's posts
  {
    method: 'GET',
    path: '/api/posts/user/{userId}',
    handler: postController.getUserPosts,
    options: {
      auth: false,
    }
  },

  // Upload post media
  {
    method: 'POST',
    path: '/api/posts/upload-media',
    handler: postController.uploadMedia,
    options: {
      auth: 'jwt',
      payload: {
        multipart: true,
        output: 'stream',
        parse: true,
        maxBytes: 50 * 1024 * 1024, // 50MB to match frontend
      }
    }
  },

  // Share post
  {
    method: 'POST',
    path: '/api/posts/{postId}/share',
    handler: postController.sharePost,
    options: {
      auth: 'jwt',
    }
  },

  // Get likes for post
  {
    method: 'GET',
    path: '/api/posts/{postId}/likes',
    handler: postController.getPostLikes,
    options: {
      auth: false,
    }
  }
];

module.exports = routes;
