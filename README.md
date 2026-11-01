# BookNook – Server API

RESTful backend service powering the BookNook community library platform. Built with Node.js, Express.js ES modules, and MongoDB, featuring token-based authentication via JWT, atomic inventory management, and strict access control.

- **Live Backend API:** [https://booknook-server-rho.vercel.app/](https://booknook-server-rho.vercel.app/)
- **Live Client Application:** [https://booknook-client-roan.vercel.app/](https://booknook-client-roan.vercel.app/)
- **Client Repository:** [booknook-client](../booknook-client)

---

## Technologies

- **Runtime:** Node.js (ES Modules)
- **Framework:** Express.js 5
- **Database:** MongoDB Native Driver (v7)
- **Authentication:** JSON Web Tokens (`jsonwebtoken`)
- **CORS & Environment:** `cors`, `dotenv`

---

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- Running MongoDB instance or MongoDB Atlas cluster

### 1. Installation

```bash
cd booknook-server
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory (you can copy `.env.example`):

```bash
cp .env.example .env
```

| Variable | Description | Production Value / Example |
| :--- | :--- | :--- |
| `PORT` | Port the API server listens on | `5000` |
| `CLIENT_URL` | Allowed origin(s) for CORS (comma-separated) | `http://localhost:3000,https://booknook-client-roan.vercel.app` |
| `JWT_SECRET` | Shared secret key for verifying JWTs (must match client) | `your_shared_jwt_secret` |
| `MONGODB_URI` | MongoDB connection string (Atlas or local) | `mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority` |
| `MONGODB_DB_NAME` | MongoDB database name | `booknook` |

> **CORS Configuration:** `index.js` splits `CLIENT_URL` by commas and strips trailing slashes, allowing simultaneous local testing (`http://localhost:3000`) and production traffic from the deployed Vercel frontend (`https://booknook-client-roan.vercel.app`).

### 3. Run Locally

```bash
# Start with auto-restart on file changes
npm run dev

# Or start in standard mode
npm start
```

The server will connect to MongoDB and start on `http://localhost:5000`.

---

## API Endpoints

### Public Endpoints

#### `GET /`
Health and welcome message.
- **Response:** `{ "success": true, "message": "BookNook API is running!" }`

#### `GET /health`
Server health status check.
- **Response:** `{ "success": true, "message": "Server is healthy" }`

#### `GET /books`
Retrieve books catalog with optional query parameters.
- **Query Parameters:**
  - `email` (optional): Filter books contributed by a specific user email.
  - `limit` (optional): Limit the number of books returned (e.g. `?limit=6`).
- **Response (200):**
  ```json
  {
    "success": true,
    "count": 6,
    "data": [
      {
        "_id": "6724...",
        "title": "To Kill a Mockingbird",
        "author": "Harper Lee",
        "category": "Fiction",
        "image": "https://...",
        "description": "...",
        "totalCopies": 5,
        "availableCopies": 4,
        "userEmail": "contributor@example.com",
        "userName": "Jane Reader",
        "createdAt": "2026-11-01T..."
      }
    ]
  }
  ```

#### `GET /books/:id`
Retrieve details of a single book by its MongoDB ObjectId.
- **Response (200):**
  ```json
  {
    "success": true,
    "data": { ...book }
  }
  ```

---

### Protected Endpoints (Require Bearer JWT)

Requests to these endpoints must include an `Authorization` header:
```http
Authorization: Bearer <your_jwt_token>
```

#### `POST /books`
Add a new book to the catalog.
- **Body:**
  ```json
  {
    "title": "Clean Code",
    "author": "Robert C. Martin",
    "category": "Science",
    "image": "https://...",
    "description": "A handbook of agile software craftsmanship.",
    "totalCopies": 3
  }
  ```
- **Behavior:** Initializes `availableCopies` equal to `totalCopies`, associates the book with the verified token's `email` and `name`, and records `createdAt`.

#### `PATCH /books/:id`
Update an existing book record. Only the user who contributed the book can edit it.
- **Body:** Any updated book fields (e.g. `title`, `author`, `category`, `image`, `description`, `totalCopies`).
- **Inventory Safety:** If `totalCopies` is updated, the server recalculates `availableCopies` while ensuring total copies cannot drop below currently borrowed copies.

#### `DELETE /books/:id`
Delete a book record from the catalog.
- **Security & Safety:** Only the owner can delete. If the book currently has an active borrowing record in the library, deletion is rejected with HTTP 400.

#### `POST /borrows`
Borrow an available book.
- **Body:**
  ```json
  {
    "bookId": "6724...",
    "borrowDate": "2026-11-01",
    "returnDate": "2026-11-15"
  }
  ```
- **Validation & Inventory Rules:**
  - `returnDate` must be strictly later than `borrowDate`.
  - Rejects if the user already holds an active borrow for that book.
  - Atomically decrements `availableCopies` only if `availableCopies > 0`.
  - If inserting the borrow record fails, the inventory decrement is automatically rolled back.
  - Borrower identity is derived strictly from the verified JWT.

#### `GET /borrows`
Retrieve all active borrow records for the authenticated user, sorted with newest first.
- **Response (200):**
  ```json
  [
    {
      "_id": "6725...",
      "bookId": "6724...",
      "bookTitle": "Clean Code",
      "bookImage": "https://...",
      "userEmail": "reader@example.com",
      "userName": "Jane Reader",
      "borrowDate": "2026-11-01",
      "returnDate": "2026-11-15",
      "createdAt": "2026-11-01T..."
    }
  ]
  ```

#### `DELETE /borrows/:id`
Return a borrowed book.
- **Behavior:**
  - Verifies that the authenticated user owns the borrow record.
  - Deletes the borrow record and atomically increments the book's `availableCopies` by 1.
  - Repeated return requests are rejected with HTTP 404 and cannot increment inventory multiple times.

---

## Deployment on Vercel

The repository includes a [vercel.json](vercel.json) configuration for running as a Vercel serverless function:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

### Steps to Deploy:
1. Import the repository into [Vercel](https://vercel.com).
2. Configure the environment variables in Vercel Project Settings:
   - `CLIENT_URL`: `http://localhost:3000,https://booknook-client-roan.vercel.app`
   - `JWT_SECRET`: Must match the client application's `JWT_SECRET`.
   - `MONGODB_URI`: MongoDB Atlas connection URI with IP whitelist enabled (`0.0.0.0/0`).
   - `MONGODB_DB_NAME`: `booknook`
3. Deploy.
