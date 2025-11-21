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
    port,
    host: "0.0.0.0",
    routes: {
      cors: {
        origin: ["*"],
        headers: ["Accept", "Authorization", "Content-Type", "If-None-Match"],
      }
    }
  });

  await registerAuthMiddleware(server);
  await server.register(require("@hapi/inert"));

  connectDB();

  // ------- SOCKET MUST ATTACH BEFORE SERVER START -------
  const httpServer = server.listener;

  const io = socketIo(httpServer, {
    cors: { origin: "*" },
    transports: ["websocket", "polling"],  // allow fallback
  });

  await server.register({
    plugin: {
      name: "socket",
      register: server => server.expose("io", io),
    },
  });

  // ------------------------------------------------------

  server.route(allRoutes);

  await server.start();

  // log AFTER start
  console.log(`Hapi HTTP Server running at: ${server.info.uri}`);
  console.log(`Socket.IO running at: ws://localhost:${port}`);

  new SocketHandler(io); // must be AFTER start

  return server;
};


init().catch(err => {
  console.error("Error starting server:", err);
  process.exit(1);
});
