
const usersRoutes = require('./users');
const authRoutes = require('./auth');

const allRoutes = [
  ...usersRoutes,
  ...authRoutes,
];

module.exports = allRoutes;
