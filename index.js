const Hapi = require('@hapi/hapi');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const connectDB = require('./config/database');
const allRoutes = require('./routes/index');
const SocketHandler = require('./socket/index');
const { registerAuthMiddleware } = require('./middleware/auth');

const init = async () => {

  const port = process.env.PORT || 5000;
  
  const server = Hapi.server({
    port: port,
    host: '0.0.0.0',
    address: '0.0.0.0',
     routes: {
        cors: {
          origin: ['*'],
          headers: ['Accept', 'Authorization', 'Content-Type', 'If-None-Match'],
          exposedHeaders: ['WWW-Authenticate', 'Server-Authorization'],
          maxAge: 86400
        },
        state: { parse: false } 
    }
  });

  // Register JWT authentication middleware
  await registerAuthMiddleware(server);

  // Skip authentication for OPTIONS requests (CORS preflight)
  server.ext('onPreAuth', (request, h) => {
    if (request.method === 'options') {
      const response = h.response().code(204);
      response.header('Access-Control-Allow-Origin', '*');
      response.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, If-None-Match');
      response.header('Access-Control-Max-Age', '86400');
      return response.takeover();
    }
    return h.continue;
  });

  await server.register({
    plugin: require('@hapi/inert'),
  });

   connectDB();

  // Serve static files from uploads directory


  // Handle CORS preflight requests - must be before other routes
  server.route({
    method: 'OPTIONS',
    path: '/{path*}',
    handler: (request, h) => {
      const response = h.response().code(204);
      response.header('Access-Control-Allow-Origin', '*');
      response.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, If-None-Match');
      response.header('Access-Control-Max-Age', '86400');
      return response;
    },
    options: {
      auth: false
    }
  });

  server.route({
    method: 'GET',
    path: '/uploads/{param*}',
    handler: (request, h) => {
      const filePath = request.params.param;
      return h.file(path.join(__dirname, 'uploads', filePath));
    },
    options: {
      auth: false, 
    }
  });


  server.route(allRoutes);

  // Start Hapi server first to get the HTTP server instance
  await server.start();
  console.log(`Hapi Server: http://localhost:${server.info.port}`);

  // Get the underlying HTTP server from Hapi
  const httpServer = server.listener;

  // Attach Socket.IO to the HTTP server
  const io = socketIo(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "PATCH"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
  });
  
  // Register socket.io as a plugin so it's accessible in routes
  await server.register({
    plugin: {
      name: 'socket',
      register: function(server) {
        server.expose('io', io);
      }
    }
  });

  // Initialize Socket.IO handler
  new SocketHandler(io);

  console.log(`Socket.IO Server: ws://localhost:${server.info.port}`);

  return server;
};

init().catch(err => {
  console.error("Error starting server:", err);
  process.exit(1);
});
