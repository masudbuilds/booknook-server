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
    console.log("You successfully connected to MongoDB!");

    const db = client.db(process.env.MONGODB_DB_NAME || "booknook");
    booksCollection = db.collection("books");
    borrowsCollection = db.collection("borrows");

    console.log("MongoDB collections are ready!");
    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    throw err;
  }
}

// Middleware & CORS configuration
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((url) => url.trim().replace(/\/$/, ""))
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Ensure database connection middleware
app.use(async (req, res, next) => {
  if (!booksCollection || !borrowsCollection) {
    try {
      await connectToMongoDB();
    } catch (err) {
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
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
}

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
    const { email, limit } = req.query;
    const filter = email ? { userEmail: email } : {};

    let query = booksCollection.find(filter).sort({ createdAt: -1 });
    if (limit) {
      query = query.limit(Number(limit));
    }

    const books = await query.toArray();

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

// Get single book by ID
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

    if (updatedBook.totalCopies !== undefined) {
      const newTotal = Number(updatedBook.totalCopies);
      if (isNaN(newTotal) || newTotal < 1) {
        return res.status(400).send({ message: "Total copies must be at least 1" });
      }

      const currentTotal = Number(existingBook.totalCopies) || 0;
      const currentAvailable = Number(existingBook.availableCopies) || 0;
      const currentlyBorrowed = Math.max(0, currentTotal - currentAvailable);

      if (newTotal < currentlyBorrowed) {
        return res.status(400).send({
          message: `Total copies cannot be less than currently borrowed copies (${currentlyBorrowed})`,
        });
      }

      updatedBook.totalCopies = newTotal;
      updatedBook.availableCopies = newTotal - currentlyBorrowed;
    }

    delete updatedBook.userEmail;
    delete updatedBook.userName;
    delete updatedBook._id;

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

    const activeBorrow = await borrowsCollection.findOne({ bookId: id });
    if (activeBorrow) {
      return res.status(400).send({
        message: "Cannot delete this book because it is currently borrowed by a library member",
      });
    }

    const result = await booksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to delete book" });
  }
});

// Borrow a book
app.post("/borrows", verifyToken, async (req, res) => {
  try {
    const { bookId, returnDate, borrowDate } = req.body;

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).send({ message: "Valid bookId is required" });
    }

    if (!returnDate) {
      return res.status(400).send({ message: "Return date is required" });
    }

    const bookObjectId = new ObjectId(bookId);
    const book = await booksCollection.findOne({ _id: bookObjectId });
    if (!book) {
      return res.status(404).send({ message: "Book not found" });
    }

    if (!book.availableCopies || Number(book.availableCopies) < 1) {
      return res.status(400).send({ message: "Book is not available" });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const effectiveBorrowDate = borrowDate || todayStr;

    const borrowTime = new Date(effectiveBorrowDate).getTime();
    const returnTime = new Date(returnDate).getTime();

    if (isNaN(borrowTime) || isNaN(returnTime)) {
      return res.status(400).send({ message: "Invalid date format" });
    }

    if (returnTime <= borrowTime) {
      return res.status(400).send({ message: "Return date must be later than borrow date" });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId: bookId,
      userEmail: req.user.email,
    });

    if (existingBorrow) {
      return res.status(400).send({
        message: "You have already borrowed this book and have not returned it yet.",
      });
    }

    const updateResult = await booksCollection.updateOne(
      { _id: bookObjectId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({
        message: "Book is not available",
      });
    }

    const borrowRecord = {
      bookId: bookId,
      bookTitle: book.title,
      bookImage: book.image,
      userEmail: req.user.email,
      userName: req.user.name || "Library Member",
      borrowDate: effectiveBorrowDate,
      returnDate: returnDate,
      createdAt: new Date(),
    };

    try {
      const borrowResult = await borrowsCollection.insertOne(borrowRecord);
      res.status(201).send({
        success: true,
        message: "Book borrowed successfully",
        insertedId: borrowResult.insertedId,
        data: borrowRecord,
      });
    } catch (insertError) {
      // Roll back inventory decrement if borrowing record insertion fails
      await booksCollection.updateOne(
        { _id: bookObjectId },
        { $inc: { availableCopies: 1 } }
      );
      throw insertError;
    }
  } catch (error) {
    console.error("Failed to borrow book:", error);
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
    const { id } = req.params;

    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid borrowing record ID" });
    }

    const borrow = await borrowsCollection.findOne({ _id: new ObjectId(id) });
    if (!borrow) {
      return res.status(404).send({ message: "Borrow record not found" });
    }

    if (borrow.userEmail !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const deleteResult = await borrowsCollection.deleteOne({ _id: new ObjectId(id) });

    if (deleteResult.deletedCount > 0) {
      if (borrow.bookId && ObjectId.isValid(borrow.bookId)) {
        await booksCollection.updateOne(
          { _id: new ObjectId(borrow.bookId) },
          { $inc: { availableCopies: 1 } }
        );
      }
    }

    res.send({
      success: true,
      message: "Book returned successfully",
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    console.error("Failed to return book:", error);
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
