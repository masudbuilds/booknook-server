import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI);

let booksCollection;
let borrowsCollection;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("You successfully connected to MongoDB!");

    const db = client.db("booknook");

    booksCollection = db.collection("books");
    borrowsCollection = db.collection("borrows");

    console.log("MongoDB collections are ready!");

    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    throw err;
  }
}

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
  })
);

app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "BookNook API is running!",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

// Get all books
app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (err) {
    console.error("Failed to fetch books:", err.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// Start server
async function startServer() {
  try {
    await connectToMongoDB();

    app.listen(PORT, () => {
      console.log(`BookNook API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

startServer();