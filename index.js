const Hapi = require('@hapi/hapi');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const connectDB = require('./config/database');
const allRoutes = require('./routes/index');
const SocketHandler = require('./socket/index');
const { registerAuthMiddleware } = require('./middleware/auth');

const init = async () => {

  const server = Hapi.server({
    port: process.env.PORT || 5000,
    host: 'localhost',
     routes: {
        cors: {
          origin: ['*'],
          
        },
        state: { parse: false } 
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
  await server.register({
    plugin: require('@hapi/inert'),
  });

   connectDB();

  // Serve static files from uploads directory


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
