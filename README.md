# 🚀 LurnStack Backend API

A RESTful backend for the LurnStack online learning platform, built with **Node.js**, **Express**, **PostgreSQL**, and **Prisma ORM**.

---

## 📁 Project Structure

```
lurnstack-backend/
├── prisma/
│   └── schema.prisma        # Database models (User, LiveClass)
├── src/
│   ├── config/
│   │   └── db.js            # Prisma client singleton
│   ├── controllers/
│   │   └── authController.js  # Signup / Login logic
│   ├── middleware/
│   │   └── authMiddleware.js  # JWT protect + adminOnly guards
│   ├── routes/
│   │   └── authRoutes.js      # Auth endpoints
│   └── server.js            # Express entry point
├── .env                     # Environment variables
├── package.json
└── README.md
```

---

## ⚙️ Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Edit `.env` with your database credentials (already pre-filled):
```env
DATABASE_URL="postgresql://postgres:kesavroman0257@localhost:5432/lurnstack_db"
JWT_SECRET="lurnstack_super_secret_jwt_key_2024"
PORT=5000
```

### 3. Generate Prisma Client & Run Migration
```bash
npx prisma migrate dev --name init
```

### 4. Start the Server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

---

## 🔌 API Endpoints

### Auth Routes — `/api/auth`

| Method | Endpoint            | Description               | Access  |
|--------|---------------------|---------------------------|---------|
| POST   | `/api/auth/register` | Register a new student   | Public  |
| POST   | `/api/auth/login`    | Login and receive JWT    | Public  |

---

### 📝 Register — `POST /api/auth/register`

**Request Body:**
```json
{
  "name": "Kesav Roman",
  "email": "kesav@example.com",
  "password": "securepassword123"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully!",
  "user": {
    "id": 1,
    "name": "Kesav Roman",
    "email": "kesav@example.com",
    "role": "student",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 🔐 Login — `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "kesav@example.com",
  "password": "securepassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful!",
  "user": {
    "name": "Kesav Roman",
    "email": "kesav@example.com",
    "role": "student"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 🛡️ Using Protected Routes

Add the JWT token in the Authorization header:
```
Authorization: Bearer <your_token_here>
```

---

## 🗄️ Database Models

### User
| Field     | Type     | Details                     |
|-----------|----------|-----------------------------|
| id        | Int      | Auto-increment primary key  |
| name      | String   | Required                    |
| email     | String   | Unique, required            |
| password  | String   | Hashed with bcrypt          |
| role      | String   | Default: `"student"`        |
| createdAt | DateTime | Default: current timestamp  |

### LiveClass
| Field       | Type     | Details                    |
|-------------|----------|----------------------------|
| id          | Int      | Auto-increment primary key |
| title       | String   | Required                   |
| description | String?  | Optional                   |
| meetLink    | String   | Google Meet URL            |
| scheduledAt | DateTime | Class schedule time        |
| createdAt   | DateTime | Default: current timestamp |
