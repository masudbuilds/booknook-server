import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
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
  if (booksCollection && borrowsCollection) return client;
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || "booknook");
    booksCollection = db.collection("books");
    borrowsCollection = db.collection("borrows");
    console.log("Connected to MongoDB");
    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    throw err;
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Ensure database connection middleware
app.use(async (req, res, next) => {
  if (!booksCollection || !borrowsCollection) {
    try {
      await connectToMongoDB();
    } catch {
      return res.status(500).send({ message: "Failed to connect to database" });
    }
  }
  next();
});

// Verify JWT token middleware
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized access" });
  }
}

// Home route
app.get("/", (req, res) => {
  res.send({ message: "BookNook API is running!" });
});

// Health check
app.get("/health", (req, res) => {
  res.send({ status: "ok" });
});

// Get all books
app.get("/books", async (req, res) => {
  try {
    const { email, limit } = req.query;
    const filter = email ? { userEmail: email } : {};

    let query = booksCollection.find(filter).sort({ createdAt: -1 });
    if (limit) {
      query = query.limit(Number(limit));
    }

    const books = await query.toArray();
    res.send(books);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch books" });
  }
});

// Get single book by ID
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const book = await booksCollection.findOne({ _id: new ObjectId(id) });
    if (!book) {
      return res.status(404).send({ message: "Book not found" });
    }

    res.send(book);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch book" });
  }
});

// Add a new book
app.post("/books", verifyToken, async (req, res) => {
  try {
    const book = req.body;
    book.createdAt = new Date();
    book.totalCopies = Number(book.totalCopies) || 1;
    book.availableCopies = book.totalCopies;
    book.userEmail = req.user.email;
    book.userName = req.user.name;

    const result = await booksCollection.insertOne(book);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to add book" });
  }
});

// Update a book
app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const existingBook = await booksCollection.findOne({ _id: new ObjectId(id) });
    if (!existingBook) {
      return res.status(404).send({ message: "Book not found" });
    }

    if (existingBook.userEmail !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const updatedBook = req.body;
    delete updatedBook._id;
    delete updatedBook.userEmail;

    if (updatedBook.totalCopies !== undefined) {
      const currentTotal = Number(existingBook.totalCopies) || 0;
      const currentAvailable = Number(existingBook.availableCopies) || 0;
      const borrowed = Math.max(0, currentTotal - currentAvailable);
      updatedBook.totalCopies = Number(updatedBook.totalCopies);
      updatedBook.availableCopies = Math.max(0, updatedBook.totalCopies - borrowed);
    }

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
app.delete("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const existingBook = await booksCollection.findOne({ _id: new ObjectId(id) });
    if (!existingBook) {
      return res.status(404).send({ message: "Book not found" });
    }

    if (existingBook.userEmail !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to delete book" });
  }
});

// Borrow a book
app.post("/borrows", verifyToken, async (req, res) => {
  try {
    const borrow = req.body;
    if (!borrow.bookId || !ObjectId.isValid(borrow.bookId)) {
      return res.status(400).send({ message: "Valid bookId is required" });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId: borrow.bookId,
      userEmail: req.user.email,
    });

    if (existingBorrow) {
      return res.status(400).send({ message: "You have already borrowed this book" });
    }

    const bookId = new ObjectId(borrow.bookId);
    const result = await booksCollection.updateOne(
      { _id: bookId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send({ message: "Book is not available" });
    }

    borrow.userEmail = req.user.email;
    borrow.userName = req.user.name;
    borrow.borrowDate = borrow.borrowDate || new Date().toISOString().split("T")[0];
    borrow.createdAt = new Date();

    const borrowResult = await borrowsCollection.insertOne(borrow);
    res.send(borrowResult);
  } catch (error) {
    res.status(500).send({ message: "Failed to borrow book" });
  }
});

// Get borrowed books
app.get("/borrows", verifyToken, async (req, res) => {
  try {
    const borrows = await borrowsCollection
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(borrows);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch borrowed books" });
  }
});

// Return a borrowed book
app.delete("/borrows/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid ID" });
    }

    const borrow = await borrowsCollection.findOne({ _id: new ObjectId(id) });
    if (!borrow) {
      return res.status(404).send({ message: "Borrow record not found" });
    }

    if (borrow.userEmail !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    await booksCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { availableCopies: 1 } }
    );

    const result = await borrowsCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to return book" });
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;
