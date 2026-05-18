const { pool, auditLog } = require('../config/db');

class FacultyModel {
  static async getClasses(facultyId) {
    const result = await pool.query(`
      SELECT s.schedule_id, sub.subject_name, sub.subject_code, sec.section_name,
             s.start_time, s.end_time, r.location
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.subject_id
      JOIN sections sec ON s.section_id = sec.section_id
      LEFT JOIN rfid_readers r ON s.reader_id = r.reader_id
      WHERE s.faculty_id = $1
    `, [facultyId]);
    return result.rows;
  }

  static async checkScheduleOwnership(scheduleId, facultyId) {
    const check = await pool.query(
      'SELECT 1 FROM schedules WHERE schedule_id = $1 AND faculty_id = $2', 
      [scheduleId, facultyId]
    );
    return check.rows.length > 0;
  }

  static async getAttendance(scheduleId) {
    const result = await pool.query(`
      SELECT al.log_id, u.first_name, u.last_name, u.student_id, al.tap_time, al.status
      FROM attendance_logs al
      JOIN class_sessions cs ON al.session_id = cs.session_id
      JOIN users u ON al.user_id = u.user_id
      WHERE cs.schedule_id = $1
      ORDER BY al.tap_time DESC
    `, [scheduleId]);
    return result.rows;
  }

  static async getOrCreateSession(scheduleId) {
    let sessionResult = await pool.query(
      'SELECT session_id FROM class_sessions WHERE schedule_id = $1 AND session_date = CURRENT_DATE',
      [scheduleId]
    );

    if (sessionResult.rows.length) {
      return sessionResult.rows[0].session_id;
    }

    const insertResult = await pool.query(
      'INSERT INTO class_sessions (schedule_id, session_date) VALUES ($1, CURRENT_DATE) RETURNING session_id',
      [scheduleId]
    );
    return insertResult.rows[0].session_id;
  }

  static async recordManualAttendance(sessionId, studentId, status) {
    await pool.query(`
      INSERT INTO attendance_logs (session_id, user_id, card_uid, status, tap_time, recorded_by)
      VALUES ($1, $2, 'MANUAL', $3, NOW(), 'manual')
      ON CONFLICT (session_id, user_id) DO UPDATE SET status = EXCLUDED.status
    `, [sessionId, studentId, status]);
  }

  static logAudit(facultyId, action, targetTable, targetId, details, ip) {
    auditLog(facultyId, action, targetTable, targetId, details, ip);
  }
}

module.exports = FacultyModel;
