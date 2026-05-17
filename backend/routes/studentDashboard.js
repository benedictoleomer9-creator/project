// routes/studentDashboard.js — Student API
const express = require('express');
const { pool } = require('../config/db');
const { requireStudent } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.session.userId + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
      cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg and .jpeg format allowed!'), false);
    }
  }
});

const router = express.Router();
router.use(requireStudent);

// POST /api/student/upload_profile_picture
router.post('/upload_profile_picture', upload.single('profile_picture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded or invalid file format.' });
    }
    const userId = req.session.userId;
    const filename = req.file.filename;

    await pool.query('UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE user_id = $2', [filename, userId]);
    res.json({ success: true, message: 'Profile picture updated successfully', profile_picture: filename });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// GET /api/student/profile
router.get('/profile', async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await pool.query(`
      SELECT u.*, rc.card_uid
      FROM users u
      LEFT JOIN rfid_cards rc ON rc.user_id = u.user_id AND rc.is_active = TRUE
      WHERE u.user_id = $1
    `, [userId]);

    const user = result.rows[0];
    if (user) delete user.password_hash;
    res.json({ success: true, profile: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/student/stats
router.get('/stats', async (req, res) => {
  try {
    const userId = req.session.userId;

    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(CASE WHEN al.status='present' THEN 1 END) AS present_count,
        COUNT(CASE WHEN al.status='late' THEN 1 END) AS late_count,
        COUNT(CASE WHEN al.status='absent' THEN 1 END) AS absent_count,
        ROUND(
          COUNT(CASE WHEN al.status IN ('present','late') THEN 1 END)::numeric
          / NULLIF(COUNT(*),0) * 100, 1
        ) AS attendance_rate
      FROM attendance_logs al WHERE al.user_id = $1
    `, [userId]);

    const bySubject = await pool.query(`
      SELECT sub.subject_code, sub.subject_name,
             COUNT(*) AS total,
             COUNT(CASE WHEN al.status='present' THEN 1 END) AS present,
             COUNT(CASE WHEN al.status='late' THEN 1 END) AS late,
             COUNT(CASE WHEN al.status='absent' THEN 1 END) AS absent
      FROM attendance_logs al
      JOIN class_sessions cs ON cs.session_id = al.session_id
      JOIN schedules sc ON sc.schedule_id = cs.schedule_id
      JOIN subjects sub ON sub.subject_id = sc.subject_id
      WHERE al.user_id = $1
      GROUP BY sub.subject_id, sub.subject_code, sub.subject_name
      ORDER BY sub.subject_code
    `, [userId]);

    res.json({ success: true, stats: stats.rows[0], by_subject: bySubject.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/student/attendance
router.get('/attendance', async (req, res) => {
  try {
    const userId = req.session.userId;
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(`
      SELECT al.log_id, al.tap_time, al.status, al.recorded_by,
             sub.subject_code, sub.subject_name,
             sec.section_name, cs.session_date,
             sc.start_time, sc.end_time
      FROM attendance_logs al
      JOIN class_sessions cs ON cs.session_id = al.session_id
      JOIN schedules sc ON sc.schedule_id = cs.schedule_id
      JOIN subjects sub ON sub.subject_id = sc.subject_id
      JOIN sections sec ON sec.section_id = sc.section_id
      WHERE al.user_id = $1
      ORDER BY al.tap_time DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    res.json({ success: true, attendance: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/student/notifications
router.get('/notifications', async (req, res) => {
  try {
    const userId = req.session.userId;

    const notifs = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    // Count BEFORE marking read
    const unreadRes = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    const unreadCount = parseInt(unreadRes.rows[0].count);

    // Mark all as read
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );

    res.json({ success: true, notifications: notifs.rows, unread: unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/student/unread_count
router.get('/unread_count', async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    res.json({ success: true, unread: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
