// routes/sessionPoll.js — Real-time session & boot polling
const express = require('express');
const { requireLogin } = require('../middleware/auth');
const SessionPollController = require('../controllers/sessionPollController');

const router = express.Router();
router.use(requireLogin);

// GET /api/session/poll?session_id=N&user_id=N
router.get('/poll', SessionPollController.pollSession);

module.exports = router;
