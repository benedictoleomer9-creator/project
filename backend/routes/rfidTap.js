// routes/rfidTap.js — Core RFID attendance recording endpoint
const express = require('express');
const { pool, auditLog } = require('../config/db');

const router = express.Router();

// POST /api/rfid/tap
router.post('/tap', async (req, res) => {
  try {
    const { card_uid, reader_code } = req.body;
    if (!card_uid || !reader_code) {
      return res.status(400).json({ success: false, message: 'card_uid and reader_code are required.' });
    }

    const cardUid = card_uid.trim();
    const readerCode = reader_code.trim();

    // 1. Validate RFID card
    const cardResult = await pool.query(`
      SELECT rc.card_id, rc.user_id, u.first_name, u.last_name, u.student_id, u.role
      FROM rfid_cards rc
      JOIN users u ON u.user_id = rc.user_id
      WHERE rc.card_uid = $1 AND rc.is_active = TRUE AND u.is_active = TRUE
      LIMIT 1
    `, [cardUid]);

    if (!cardResult.rows.length) {
      auditLog(null, 'rfid_tap_unknown', 'rfid_cards', 0, { card_uid: cardUid, reader: readerCode });
      return res.status(404).json({ success: false, message: 'Unrecognized or inactive RFID card.' });
    }
    const card = cardResult.rows[0];

    // 2. Find reader
    const readerResult = await pool.query(`
      SELECT reader_id, reader_code, location, weekend_restricted
      FROM rfid_readers WHERE reader_code = $1 AND is_active = TRUE LIMIT 1
    `, [readerCode]);

    if (!readerResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Unknown reader code.' });
    }
    const reader = readerResult.rows[0];

    // 3. Current day/time in Manila timezone
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = days[now.getDay()];
    const currentTime = now.toTimeString().slice(0, 8);

    // 4. Weekend access control
    const isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek);
    if (isWeekend && reader.weekend_restricted) {
      auditLog(card.user_id, 'rfid_tap_weekend_blocked', 'rfid_readers', reader.reader_id, {
        card_uid: cardUid, reader: readerCode, day_of_week: dayOfWeek, reason: 'Reader is weekend-restricted'
      });
      return res.status(403).json({ success: false, message: `Access denied. Reader '${readerCode}' does not allow weekend access on ${dayOfWeek}.` });
    }

    // 5. Find active schedule
    const schedResult = await pool.query(`
      SELECT s.*, sub.subject_name, sub.subject_code, sec.section_name,
             s.is_weekend_session,
             u.first_name AS faculty_first, u.last_name AS faculty_last
      FROM schedules s
      JOIN subjects sub ON sub.subject_id = s.subject_id
      JOIN sections sec ON sec.section_id = s.section_id
      JOIN users u ON u.user_id = s.faculty_id
      WHERE s.reader_id = $1 AND s.day_of_week = $2
        AND s.start_time <= $3::time AND s.end_time >= $3::time
        AND s.is_active = TRUE
      LIMIT 1
    `, [reader.reader_id, dayOfWeek, currentTime]);

    if (!schedResult.rows.length) {
      const timeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return res.status(404).json({ success: false, message: `No active class at ${readerCode} on ${dayOfWeek} at ${timeFormatted}.` });
    }
    const schedule = schedResult.rows[0];

    // 6. Get or create class session
    let sessionResult = await pool.query(`
      SELECT * FROM class_sessions
      WHERE schedule_id = $1 AND session_date = CURRENT_DATE AND status = 'open' LIMIT 1
    `, [schedule.schedule_id]);

    let session;
    if (!sessionResult.rows.length) {
      const insertRes = await pool.query(`
        INSERT INTO class_sessions (schedule_id, session_date, opened_at, status)
        VALUES ($1, CURRENT_DATE, NOW(), 'open') RETURNING *
      `, [schedule.schedule_id]);
      session = insertRes.rows[0];
    } else {
      session = sessionResult.rows[0];
    }

    // 7. Check duplicate tap
    const existing = await pool.query(
      'SELECT * FROM attendance_logs WHERE session_id = $1 AND user_id = $2 LIMIT 1',
      [session.session_id, card.user_id]
    );
    if (existing.rows.length) {
      const ex = existing.rows[0];
      return res.status(409).json({
        success: false,
        message: `Already recorded: ${card.first_name} ${card.last_name} is marked ${ex.status} for this session.`,
        status: ex.status,
        tap_time: ex.tap_time,
      });
    }

    // 8. Determine present / late
    const startParts = schedule.start_time.split(':');
    const scheduleStart = new Date(now);
    scheduleStart.setHours(parseInt(startParts[0]), parseInt(startParts[1]), parseInt(startParts[2] || 0), 0);
    const lateThreshold = new Date(scheduleStart.getTime() + schedule.late_minutes * 60000);
    const attendanceStatus = (now <= lateThreshold) ? 'present' : 'late';

    // 9. Record attendance
    const logResult = await pool.query(`
      INSERT INTO attendance_logs (session_id, user_id, card_uid, tap_time, status, recorded_by)
      VALUES ($1, $2, $3, NOW(), $4, 'rfid') RETURNING log_id, tap_time
    `, [session.session_id, card.user_id, cardUid, attendanceStatus]);
    const log = logResult.rows[0];

    // 10. Create notification
    const tapTime = new Date(log.tap_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
    const weekendNote = schedule.is_weekend_session ? ' [Weekend Session]' : '';

    const notifTitle = attendanceStatus === 'present'
      ? `✅ Attendance Recorded — ${schedule.subject_code}${weekendNote}`
      : `⚠️ Late Arrival — ${schedule.subject_code}${weekendNote}`;

    const notifMessage = attendanceStatus === 'present'
      ? `You were marked PRESENT for ${schedule.subject_name} (${schedule.section_name}) at ${tapTime} on ${dayOfWeek}.`
      : `You were marked LATE for ${schedule.subject_name} (${schedule.section_name}) at ${tapTime}. Class started at ${scheduleStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`;

    await pool.query(
      'INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)',
      [card.user_id, notifTitle, notifMessage, attendanceStatus]
    );

    auditLog(card.user_id, 'rfid_tap', 'attendance_logs', log.log_id, {
      card_uid: cardUid, reader: readerCode, status: attendanceStatus,
      day_of_week: dayOfWeek, is_weekend: isWeekend, is_weekend_session: !!schedule.is_weekend_session,
    });

    res.json({
      success: true,
      message: `${card.first_name} ${card.last_name} — ${attendanceStatus.toUpperCase()}`,
      data: {
        log_id: log.log_id,
        student: `${card.first_name} ${card.last_name}`,
        student_id: card.student_id,
        subject: schedule.subject_name,
        subject_code: schedule.subject_code,
        section: schedule.section_name,
        status: attendanceStatus,
        tap_time: tapTime,
        session_id: session.session_id,
        day_of_week: dayOfWeek,
        is_weekend_session: !!schedule.is_weekend_session,
      },
    });
  } catch (err) {
    console.error('RFID tap error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;
