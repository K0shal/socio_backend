require('dotenv').config();
const mongoose = require('mongoose');
const { DATABASE_URL } = require('./config');

// MongoDB connection configuration
const connectDB = async () => {
  try {
    const mongoUri = DATABASE_URL || 'mongodb://localhost:27017/linkedin_clone';
    
    await mongoose.connect(mongoUri);
    
    console.log('MongoDB Connected successfully');
    return mongoose.connection;
  } catch (error) {
    console.error('Database connection error:', error.message);
    
    
    console.log('Server will continue without database connection.');
    return null;
  }
};

module.exports = connectDB;
