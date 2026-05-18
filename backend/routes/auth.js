// routes/auth.js — Login, Register, Logout
const express = require('express');
const AuthController = require('../controllers/authController');

const router = express.Router();

// POST /api/auth/login
router.post('/login', AuthController.login);

// POST /api/auth/register
router.post('/register', AuthController.register);

// POST /api/auth/logout
router.post('/logout', AuthController.logout);

module.exports = router;
