const Joi = require('@hapi/joi');

const validatePost = (payload) => {
  const schema = Joi.object({
    content: Joi.string()
      .required()
      .min(1)
      .max(2000)
      .trim()
      .messages({
        'string.empty': 'Post content cannot be empty',
        'string.min': 'Post content must be at least 1 character long',
        'string.max': 'Post content cannot exceed 2000 characters',
        'any.required': 'Post content is required'
      }),
    visibility: Joi.string()
      .valid('public', 'friends', 'private')
      .default('public')
      .messages({
        'any.only': 'Visibility must be one of: public, friends, private'
      }),
    media: Joi.array()
      .items(Joi.object())
      .optional()
      .messages({
        'array.base': 'Media must be an array'
      })
  });

  return schema.validate(payload, { abortEarly: false });
};

module.exports = { validatePost };
