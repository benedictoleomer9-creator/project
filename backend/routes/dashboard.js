// routes/dashboard.js — Admin Dashboard API
const express = require('express');
const { pool, auditLog } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    let date = req.query.date || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = new Date().toISOString().split('T')[0];

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role='student' AND is_active=TRUE) AS total_students,
        (SELECT COUNT(*) FROM attendance_logs al
         JOIN class_sessions cs ON cs.session_id = al.session_id
         WHERE cs.session_date = $1 AND al.status='present') AS present_today,
        (SELECT COUNT(*) FROM attendance_logs al
         JOIN class_sessions cs ON cs.session_id = al.session_id
         WHERE cs.session_date = $1 AND al.status='late') AS late_today,
        (SELECT COUNT(*) FROM class_sessions WHERE session_date = $1) AS sessions_today
    `, [date]);

    const weekly = await pool.query(`
      SELECT cs.session_date::text AS date,
             COUNT(CASE WHEN al.status='present' THEN 1 END) AS present,
             COUNT(CASE WHEN al.status='late' THEN 1 END) AS late,
             COUNT(CASE WHEN al.status='absent' THEN 1 END) AS absent
      FROM class_sessions cs
      LEFT JOIN attendance_logs al ON al.session_id = cs.session_id
      WHERE cs.session_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY cs.session_date ORDER BY cs.session_date
    `);

    res.json({ success: true, stats: stats.rows[0], weekly: weekly.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/logs
router.get('/logs', async (req, res) => {
  try {
    let date = req.query.date || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = new Date().toISOString().split('T')[0];
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const logs = await pool.query(`
      SELECT al.log_id, al.tap_time, al.status, al.card_uid, al.recorded_by,
             u.first_name, u.last_name, u.student_id,
             sub.subject_code, sub.subject_name, sec.section_name,
             cs.session_date
      FROM attendance_logs al
      JOIN class_sessions cs ON cs.session_id = al.session_id
      JOIN schedules sc ON sc.schedule_id = cs.schedule_id
      JOIN users u ON u.user_id = al.user_id
      JOIN subjects sub ON sub.subject_id = sc.subject_id
      JOIN sections sec ON sec.section_id = sc.section_id
      WHERE cs.session_date = $1
      ORDER BY al.tap_time DESC
      LIMIT $2 OFFSET $3
    `, [date, limit, offset]);

    const count = await pool.query(`
      SELECT COUNT(*) FROM attendance_logs al
      JOIN class_sessions cs ON cs.session_id = al.session_id
      WHERE cs.session_date = $1
    `, [date]);

    res.json({ success: true, logs: logs.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/students
router.get('/students', async (req, res) => {
  try {
    const search = req.query.search || '';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const like = `%${search}%`;

    const result = await pool.query(`
      SELECT u.user_id, u.student_id, u.first_name, u.last_name, u.email,
             u.gender, u.contact_no, u.is_active, u.status, u.created_at,
             rc.card_uid
      FROM users u
      LEFT JOIN rfid_cards rc ON rc.user_id = u.user_id AND rc.is_active = TRUE
      WHERE u.role = 'student' AND u.status = 'active'
        AND (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.student_id ILIKE $1)
      ORDER BY u.last_name, u.first_name
      LIMIT $2 OFFSET $3
    `, [like, limit, offset]);

    res.json({ success: true, students: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/pending_students
router.get('/pending_students', async (req, res) => {
  try {
    const search = req.query.search || '';
    const like = `%${search}%`;

    const result = await pool.query(`
      SELECT u.user_id, u.student_id, u.first_name, u.last_name, u.email,
             u.gender, u.contact_no, u.status, u.created_at
      FROM users u
      WHERE u.role = 'student' AND u.status = 'pending'
        AND (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.student_id ILIKE $1)
      ORDER BY u.created_at DESC
    `, [like]);

    const countRes = await pool.query("SELECT COUNT(*) FROM users WHERE role='student' AND status='pending'");

    res.json({ success: true, students: result.rows, pending_count: parseInt(countRes.rows[0].count) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/dashboard/assign_uid
router.post('/assign_uid', async (req, res) => {
  try {
    const { user_id, card_uid } = req.body;
    if (!user_id || !card_uid) {
      return res.status(400).json({ success: false, message: 'user_id and card_uid are required.' });
    }

    const cuid = card_uid.trim();

    // Check duplicate
    const dupCheck = await pool.query(
      `SELECT rc.card_id, u.student_id FROM rfid_cards rc
       JOIN users u ON u.user_id = rc.user_id
       WHERE rc.card_uid = $1 AND rc.is_active = TRUE AND rc.user_id != $2`,
      [cuid, user_id]
    );
    if (dupCheck.rows.length) {
      return res.status(409).json({ success: false, message: `UID '${cuid}' is already assigned to student ${dupCheck.rows[0].student_id}.` });
    }

    // Deactivate previous cards
    await pool.query('UPDATE rfid_cards SET is_active = FALSE WHERE user_id = $1', [user_id]);

    // Insert new card
    await pool.query(
      `INSERT INTO rfid_cards (card_uid, user_id, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (card_uid) DO UPDATE SET user_id = EXCLUDED.user_id, is_active = TRUE`,
      [cuid, user_id]
    );

    // Activate student
    await pool.query(
      "UPDATE users SET status = 'active', is_active = TRUE, updated_at = NOW() WHERE user_id = $1 AND status = 'pending'",
      [user_id]
    );

    auditLog(req.session.userId, 'assign_uid', 'rfid_cards', parseInt(user_id), { card_uid: cuid, activated_user_id: user_id }, req.ip);
    res.json({ success: true, message: 'RFID card assigned and student account activated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/readers
router.get('/readers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rfid_readers ORDER BY reader_code');
    res.json({ success: true, readers: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/schedules
router.get('/schedules', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, sub.subject_name, sub.subject_code,
             sec.section_name, rr.reader_code,
             u.first_name||' '||u.last_name AS faculty_name
      FROM schedules s
      JOIN subjects sub ON sub.subject_id = s.subject_id
      JOIN sections sec ON sec.section_id = s.section_id
      JOIN rfid_readers rr ON rr.reader_id = s.reader_id
      JOIN users u ON u.user_id = s.faculty_id
      ORDER BY s.day_of_week, s.start_time
    `);
    res.json({ success: true, schedules: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/subjects
router.get('/subjects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY subject_code');
    res.json({ success: true, subjects: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/sections
router.get('/sections', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sections ORDER BY section_name');
    res.json({ success: true, sections: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/dashboard/audit
router.get('/audit', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(`
      SELECT al.*, u.first_name||' '||u.last_name AS user_name, u.student_id
      FROM audit_logs al LEFT JOIN users u ON u.user_id = al.user_id
      ORDER BY al.created_at DESC LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
