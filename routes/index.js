
const usersRoutes = require('./users');
const authRoutes = require('./auth');
const postsRoutes = require('./posts');
const friendsRoutes = require('./friends');
const chatRoutes = require('./chat');

const allRoutes = [
  ...usersRoutes,
  ...authRoutes,
  ...postsRoutes,
  ...friendsRoutes,
  ...chatRoutes,
];

module.exports = allRoutes;
