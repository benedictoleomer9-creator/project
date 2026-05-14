// routes/sessionPoll.js — Real-time session & boot polling
const express = require('express');
const { pool } = require('../config/db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

// GET /api/session/poll?session_id=N&user_id=N
router.get('/poll', async (req, res) => {
  try {
    const sessionId = parseInt(req.query.session_id);
    if (!sessionId) return res.status(400).json({ success: false, message: 'session_id required.' });

    // 1. Check session status
    const sessionRes = await pool.query('SELECT status, closed_at FROM class_sessions WHERE session_id = $1', [sessionId]);
    if (!sessionRes.rows.length) return res.status(404).json({ success: false, message: 'Session not found.' });
    const sessionData = sessionRes.rows[0];

    // 2. Check if user was booted
    const userId = parseInt(req.query.user_id) || req.session.userId;
    let isBooted = false, bootReason = '', bootedAt = null;

    if (userId) {
      try {
        const bootRes = await pool.query(
          'SELECT reason, booted_at FROM session_boots WHERE session_id = $1 AND user_id = $2 ORDER BY booted_at DESC LIMIT 1',
          [sessionId, userId]
        );
        if (bootRes.rows.length) {
          isBooted = true;
          bootReason = bootRes.rows[0].reason;
          bootedAt = bootRes.rows[0].booted_at;
        }
      } catch (e) { /* table may not exist */ }
    }

    // 3. Attendance status
    let attendanceStatus = null;
    if (userId) {
      const attRes = await pool.query(
        'SELECT status, tap_time FROM attendance_logs WHERE session_id = $1 AND user_id = $2 LIMIT 1',
        [sessionId, userId]
      );
      if (attRes.rows.length) attendanceStatus = attRes.rows[0];
    }

    // 4. Tapped count
    const cntRes = await pool.query('SELECT COUNT(*) FROM attendance_logs WHERE session_id = $1', [sessionId]);

    res.json({
      success: true,
      session_id: sessionId,
      session_status: sessionData.status,
      session_closed: sessionData.status === 'closed',
      closed_at: sessionData.closed_at,
      is_booted: isBooted,
      boot_reason: bootReason,
      booted_at: bootedAt,
      attendance: attendanceStatus,
      tapped_count: parseInt(cntRes.rows[0].count),
      polled_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
