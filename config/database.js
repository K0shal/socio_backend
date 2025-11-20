require('dotenv').config();
const mongoose = require('mongoose');
const {DATABASE_URL} = require('./config');

// MongoDB connection configuration
const connectDB = async () => {
  try {
    const mongoUri = DATABASE_URL  ||'mongodb://localhost:27017/linkedin_clone';
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('Database connection error:', error);
    console.log('MongoDB might not be running. Server will continue without database connection.');
    // Don't exit process, just log the error
    return null;
  }
};

module.exports = connectDB;
