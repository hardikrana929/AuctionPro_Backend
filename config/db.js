const mongoose = require('mongoose');
const connectDB = async()=>{
    const mongoUrl = process.env.MONGODB_URI;
    if(!mongoUrl){
        throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(mongoUrl,{
        serverSelectionTimeoutMS: 10000,
    });

    console.log(`MongoDB connected: ${mongoose.connection.host}`);
};

module.exports = connectDB;