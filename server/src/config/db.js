import mongoose from "mongoose";

/**
 * Connect to MongoDB Atlas using the MONGODB_URI environment variable.
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI not set — skipping database connection");
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB Atlas");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
}
