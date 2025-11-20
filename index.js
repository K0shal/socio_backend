
const Hapi = require('@hapi/hapi');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/database');
const allRoutes = require('./routes/index');
const SocketHandler = require('./socket/index');

const init = async () => {
  // Create Hapi server
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: 'localhost',
    routes: {
      cors: {
        origin: ['*'],
        headers: ['Accept', 'Authorization', 'Content-Type', 'If-None-Match', 'Accept-language']
      }
    }
  });

  // Create HTTP server for Socket.io
  const httpServer = http.createServer(server.listener);
  const io = socketIo(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Connect to database
  connectDB();

  // Register routes
  server.route(allRoutes);

  // Initialize Socket.io handler
  new SocketHandler(io);
  await httpServer.listen(server.info.port);
  console.log(`HTTP Server: http://localhost:${server.info.port}`);
  console.log(`Socket.IO Server: ws://localhost:${server.info.port}`);

  return server;
};

init().catch(err => {
  console.error('Error starting server:', err);
  process.exit(1);
});

module.exports = init;
