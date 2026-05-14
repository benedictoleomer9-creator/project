// routes/faculty.js — Faculty API
const express = require('express');
const { pool, auditLog } = require('../config/db');
const { requireFaculty } = require('../middleware/auth');

const router = express.Router();
router.use(requireFaculty);

// GET /api/faculty/classes
router.get('/classes', async (req, res) => {
  try {
    const facultyId = req.session.userId;
    const result = await pool.query(`
      SELECT s.schedule_id, sub.subject_name, sub.subject_code, sec.section_name,
             s.start_time, s.end_time, r.location
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.subject_id
      JOIN sections sec ON s.section_id = sec.section_id
      LEFT JOIN rfid_readers r ON s.reader_id = r.reader_id
      WHERE s.faculty_id = $1
    `, [facultyId]);

    res.json({ success: true, classes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/faculty/attendance?schedule_id=N
router.get('/attendance', async (req, res) => {
  try {
    const facultyId = req.session.userId;
    const schedId = parseInt(req.query.schedule_id);
    if (!schedId) return res.status(400).json({ success: false, message: 'schedule_id required.' });

    // Ownership check
    const check = await pool.query('SELECT 1 FROM schedules WHERE schedule_id = $1 AND faculty_id = $2', [schedId, facultyId]);
    if (!check.rows.length) return res.status(403).json({ success: false, message: 'Unauthorized schedule.' });

    const result = await pool.query(`
      SELECT al.log_id, u.first_name, u.last_name, u.student_id, al.tap_time, al.status
      FROM attendance_logs al
      JOIN class_sessions cs ON al.session_id = cs.session_id
      JOIN users u ON al.user_id = u.user_id
      WHERE cs.schedule_id = $1
      ORDER BY al.tap_time DESC
    `, [schedId]);

    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/faculty/manual_mark
router.post('/manual_mark', async (req, res) => {
  try {
    const facultyId = req.session.userId;
    const { student_id, schedule_id, status = 'present' } = req.body;

    if (!student_id || !schedule_id) {
      return res.status(400).json({ success: false, message: 'Missing data.' });
    }
    if (!['present', 'late', 'absent'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be present, late, or absent.' });
    }

    // Ownership check
    const ownerCheck = await pool.query('SELECT 1 FROM schedules WHERE schedule_id = $1 AND faculty_id = $2', [schedule_id, facultyId]);
    if (!ownerCheck.rows.length) {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this schedule.' });
    }

    // Find or create session
    let sessionResult = await pool.query(
      'SELECT session_id FROM class_sessions WHERE schedule_id = $1 AND session_date = CURRENT_DATE',
      [schedule_id]
    );

    let sessionId;
    if (!sessionResult.rows.length) {
      const insertResult = await pool.query(
        'INSERT INTO class_sessions (schedule_id, session_date) VALUES ($1, CURRENT_DATE) RETURNING session_id',
        [schedule_id]
      );
      sessionId = insertResult.rows[0].session_id;
    } else {
      sessionId = sessionResult.rows[0].session_id;
    }

    // Insert/update attendance
    await pool.query(`
      INSERT INTO attendance_logs (session_id, user_id, card_uid, status, tap_time, recorded_by)
      VALUES ($1, $2, 'MANUAL', $3, NOW(), 'manual')
      ON CONFLICT (session_id, user_id) DO UPDATE SET status = EXCLUDED.status
    `, [sessionId, student_id, status]);

    auditLog(facultyId, 'manual_attendance', 'attendance_logs', student_id, { status }, req.ip);
    res.json({ success: true, message: 'Attendance updated manually.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
