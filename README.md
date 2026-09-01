# CEB Energy Saver - Secure Web App

A browser-based electricity management application focused on reducing household electricity wastage. This project has been upgraded to a secure, client-server architecture.

## Features
- Secure user authentication (Login/Signup) with bcrypt password hashing
- Session management using JSON Web Tokens (JWT)
- Live household power overview
- Appliance monitoring and on/off controls
- Daily and weekly usage analytics
- Wastage and high-consumption alerts

## Architecture
The application is split into two main components:
- **`backend/`**: A Node.js and Express API server connected to an SQLite database.
- **`frontend/`**: The user interface built with HTML, CSS, and Vanilla JS.

---

## How to Run Locally

You will need to run both the backend server and serve the frontend files.

### 1. Start the Backend Server

You must have [Node.js](https://nodejs.org/) installed.

1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install the dependencies (first time only):
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   node server.js
   ```
   *The backend will now be running on `http://localhost:3000`.*

### 2. Start the Frontend

You need a local web server to serve the frontend files. If you have Python installed, you can use its built-in HTTP server.

1. Open a **new** terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Start a local server:
   ```bash
   python -m http.server 8000
   ```
3. Open your web browser and go to:
   **[http://localhost:8000](http://localhost:8000)**

---
## Notes
This is a concept/demo application and is not an official product of the Ceylon Electricity Board. It uses sample data and does not connect to a real smart meter or CEB billing system.
