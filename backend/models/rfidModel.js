const { pool, auditLog } = require('../config/db');

class RfidModel {
  static async validateCard(cardUid) {
    const result = await pool.query(`
      SELECT rc.card_id, rc.user_id, u.first_name, u.last_name, u.student_id, u.role
      FROM rfid_cards rc
      JOIN users u ON u.user_id = rc.user_id
      WHERE rc.card_uid = $1 AND rc.is_active = TRUE AND u.is_active = TRUE
      LIMIT 1
    `, [cardUid]);
    return result.rows[0] || null;
  }

  static async getReader(readerCode) {
    const result = await pool.query(`
      SELECT reader_id, reader_code, location, weekend_restricted
      FROM rfid_readers WHERE reader_code = $1 AND is_active = TRUE LIMIT 1
    `, [readerCode]);
    return result.rows[0] || null;
  }

  static async getActiveSchedule(readerId, dayOfWeek, currentTime) {
    const result = await pool.query(`
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
    `, [readerId, dayOfWeek, currentTime]);
    return result.rows[0] || null;
  }

  static async getOrCreateSession(scheduleId) {
    let result = await pool.query(`
      SELECT * FROM class_sessions
      WHERE schedule_id = $1 AND session_date = CURRENT_DATE AND status = 'open' LIMIT 1
    `, [scheduleId]);
    
    if (result.rows.length) {
      return result.rows[0];
    }
    
    const insertRes = await pool.query(`
      INSERT INTO class_sessions (schedule_id, session_date, opened_at, status)
      VALUES ($1, CURRENT_DATE, NOW(), 'open') RETURNING *
    `, [scheduleId]);
    return insertRes.rows[0];
  }

  static async checkDuplicateTap(sessionId, userId) {
    const result = await pool.query(
      'SELECT * FROM attendance_logs WHERE session_id = $1 AND user_id = $2 LIMIT 1',
      [sessionId, userId]
    );
    return result.rows[0] || null;
  }

  static async recordAttendance(sessionId, userId, cardUid, status) {
    const result = await pool.query(`
      INSERT INTO attendance_logs (session_id, user_id, card_uid, tap_time, status, recorded_by)
      VALUES ($1, $2, $3, NOW(), $4, 'rfid') RETURNING log_id, tap_time
    `, [sessionId, userId, cardUid, status]);
    return result.rows[0];
  }

  static async createNotification(userId, title, message, type) {
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)',
      [userId, title, message, type]
    );
  }

  static logAudit(userId, action, targetTable, targetId, details) {
    auditLog(userId, action, targetTable, targetId, details);
  }
}

module.exports = RfidModel;
