
const successResponse = (h, data = {}, message = 'Success', statusCode = 200) => {
  return h.response({
    success: true,
    message,
    data
  }).code(statusCode);
};


const authResponse = (h, user, token, message = 'Authentication successful') => {
  return h.response({
    success: true,
    message,
    user: {
      id: user._id,
      email: user.email,
      profilePicture: user.profilePicture,
      name: user.name
    },
    token
  }).code(200);
};

const errorResponse = (h, message = 'Error', statusCode = 400, details = null) => {
  const response = {
    success: false,
    message
  };

  if (details) {
    response.details = details;
  }

  return h.response(response).code(statusCode);
};


const validationErrorResponse = (h, errors, message = 'Validation failed') => {
  return h.response({
    success: false,
    message,
    errors
  }).code(422);
};


const notFoundResponse = (h, message = 'Resource not found') => {
  return h.response({
    success: false,
    message
  }).code(404);
};


const unauthorizedResponse = (h, message = 'Unauthorized') => {
  return h.response({
    success: false,
    message
  }).code(401);
};


const forbiddenResponse = (h, message = 'Forbidden') => {
  return h.response({
    success: false,
    message
  }).code(403);
};


const serverErrorResponse = (h, message = 'Internal server error') => {
  return h.response({
    success: false,
    message
  }).code(500);
};

module.exports = {
  successResponse,
  authResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse
};
