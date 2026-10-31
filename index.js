import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB configuration
const client = new MongoClient(process.env.MONGODB_URI);

let db;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
  }),
);

app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "BookNook API is running!",
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    database: db ? "connected" : "disconnected",
  });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    await client.connect();

    db = client.db("booknook");

    await db.command({ ping: 1 });

    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(`BookNook API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }
}

startServer();
