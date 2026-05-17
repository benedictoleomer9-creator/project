// server.js — CTED RFID Attendance System (Node.js/Express)
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'cted-rfid-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/student', require('./routes/studentDashboard'));
app.use('/api/rfid', require('./routes/rfidTap'));
app.use('/api/session', require('./routes/sessionPoll'));
app.use('/api/schedule', require('./routes/scheduleAdmin'));

// Session check endpoint
app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    user: {
      user_id: req.session.userId,
      student_id: req.session.studentId,
      name: req.session.name,
      role: req.session.role,
    },
  });
});

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🟢 CTED RFID Attendance System`);
  console.log(`  → http://localhost:${PORT}\n`);
});
