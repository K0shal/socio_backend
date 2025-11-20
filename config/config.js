require('dotenv').config();
module.exports={
    DATABASE_URL:process.env.DATABASE_URL,
    GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET,
    JWT_SECRET:process.env.JWT_SECRET,
    JWT_EXPIRE:process.env.JWT_EXPIRE
}
