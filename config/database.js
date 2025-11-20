require('dotenv').config();
const mongoose = require('mongoose');
const { DATABASE_URL } = require('./config');

// MongoDB connection configuration
const connectDB = async () => {
  try {
    const mongoUri = DATABASE_URL || 'mongodb://localhost:27017/linkedin_clone';
    
    // Updated mongoose connection options for newer versions
    await mongoose.connect(mongoUri);
    
    console.log('MongoDB Connected successfully');
    return mongoose.connection;
  } catch (error) {
    console.error('Database connection error:', error.mesage);
    
    // Check if it's a connection error that should be handled gracefully
    if (error.name === 'MongooseServerSelectionError') {
      console.log('MongoDB server might not be accessible. Check your network connection and database URI.');
    } else if (error.name === 'MongoParseError') {
      console.log('Invalid MongoDB URI format. Please check your DATABASE_URL.');
    }
    
    console.log('Server will continue without database connection.');
    return null;
  }
};

module.exports = connectDB;
