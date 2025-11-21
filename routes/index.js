
const usersRoutes = require('./users');
const authRoutes = require('./auth');
const postsRoutes = require('./posts');
const friendsRoutes = require('./friends');

const allRoutes = [
  ...usersRoutes,
  ...authRoutes,
  ...postsRoutes,
  ...friendsRoutes,
];

module.exports = allRoutes;
