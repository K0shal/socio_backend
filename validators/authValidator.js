const Joi = require('joi');

// Validation schemas
const googleTokenSchema = Joi.object({
  token: Joi.string().required().messages({
    'string.empty': 'Token is required',
    'any.required': 'Token is required'
  })
});

module.exports = {
  googleTokenSchema
};
