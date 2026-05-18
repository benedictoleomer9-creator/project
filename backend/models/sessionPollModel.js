const { pool } = require('../config/db');

class SessionPollModel {
  static async getSessionStatus(sessionId) {
    const sessionRes = await pool.query('SELECT status, closed_at FROM class_sessions WHERE session_id = $1', [sessionId]);
    return sessionRes.rows[0];
  }

  static async getBootStatus(sessionId, userId) {
    if (!userId) return null;
    try {
      const bootRes = await pool.query(
        'SELECT reason, booted_at FROM session_boots WHERE session_id = $1 AND user_id = $2 ORDER BY booted_at DESC LIMIT 1',
        [sessionId, userId]
      );
      return bootRes.rows[0];
    } catch (e) {
      return null;
    }
  }

  static async getAttendanceStatus(sessionId, userId) {
    if (!userId) return null;
    const attRes = await pool.query(
      'SELECT status, tap_time FROM attendance_logs WHERE session_id = $1 AND user_id = $2 LIMIT 1',
      [sessionId, userId]
    );
    return attRes.rows[0];
  }

  static async getTappedCount(sessionId) {
    const cntRes = await pool.query('SELECT COUNT(*) FROM attendance_logs WHERE session_id = $1', [sessionId]);
    return parseInt(cntRes.rows[0].count);
  }
}

module.exports = SessionPollModel;
