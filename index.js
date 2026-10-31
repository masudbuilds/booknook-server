import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

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

// Get a single book by ID
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    res.status(200).json({
      success: true,
      data: book,
    });
  } catch (err) {
    console.error("Failed to fetch book:", err.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book",
    });
  }
});

// Add a new book
app.post("/books", async (req, res) => {
  try {
    const book = req.body;
    book.createdAt = new Date();
    book.availableCopies = Number(book.totalCopies);

    const result = await booksCollection.insertOne(book);

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to add book" });
  }
});

// Update a book
app.patch("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedBook = req.body;

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedBook }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update book" });
  }
});

// Delete a book
app.delete("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await booksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to delete book" });
  }
});


// Borrow a book
app.post("/borrows", async (req, res) => {
  try {
    const borrow = req.body;
    const bookId = new ObjectId(borrow.bookId);

    const result = await booksCollection.updateOne(
      { _id: bookId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send({
        message: "Book is not available",
      });
    }

    borrow.borrowDate = new Date();

    const borrowResult = await borrowsCollection.insertOne(borrow);

    res.send(borrowResult);
  } catch (error) {
    res.status(500).send({ message: "Failed to borrow book" });
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