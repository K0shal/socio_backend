const Hapi = require('@hapi/hapi');

// Basic API routes
const apiRoutes = [
  {
    method: 'GET',
    path: '/',
    handler: (request, h) => {
      return {
        message: 'LinkedIn Clone API Server is running!',
        timestamp: new Date(),
        version: '1.0.0',
        framework: 'Hapi.js'
      };
    }
  },
  {
    method: 'GET',
    path: '/api/health',
    handler: (request, h) => {
      return {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date()
      };
    }
  }
];

module.exports = apiRoutes;
