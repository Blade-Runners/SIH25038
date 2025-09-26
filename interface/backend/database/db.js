import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const mongoDBUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bluecarbon';

const connectDB = async () => {
    try {
        await mongoose.connect(mongoDBUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.log("DataBase connection failed", error);
        
    }

}

export default connectDB;