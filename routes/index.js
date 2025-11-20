
const usersRoutes = require('./users');
const authRoutes = require('./auth');
const postsRoutes = require('./posts');

const allRoutes = [
  ...usersRoutes,
  ...authRoutes,
  ...postsRoutes,
];

module.exports = allRoutes;
