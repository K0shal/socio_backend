const Hapi = require('@hapi/hapi');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/database');
const allRoutes = require('./routes/index');
const SocketHandler = require('./socket/index');
const { registerAuthMiddleware } = require('./middleware/auth');

const init = async () => {

  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: 'localhost',
     routes: {
        cors: true 
    }
  });

  // Register JWT authentication middleware
  await registerAuthMiddleware(server);

  const httpServer = http.createServer(server.listener);


  const io = socketIo(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "PATCH"]
    }
  });


  connectDB();


  server.route(allRoutes);


  await server.start();
  console.log(`Hapi Server: http://localhost:${server.info.port}`);


  httpServer.listen(server.info.port, () => {
    console.log(`Socket.IO Server: ws://localhost:${server.info.port}`);
  });


  new SocketHandler(io);

  return server;
};

init().catch(err => {
  console.error("Error starting server:", err);
  process.exit(1);
});

module.exports = init;
