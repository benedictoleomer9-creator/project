const { pool } = require('../config/db');

class StudentDashboardModel {
  static async updateProfilePicture(userId, filename) {
    await pool.query('UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE user_id = $2', [filename, userId]);
  }

  static async getProfile(userId) {
    const result = await pool.query(`
      SELECT u.*, rc.card_uid
      FROM users u
      LEFT JOIN rfid_cards rc ON rc.user_id = u.user_id AND rc.is_active = TRUE
      WHERE u.user_id = $1
    `, [userId]);
    return result.rows[0];
  }

  static async getStats(userId) {
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

    return { stats: stats.rows[0], by_subject: bySubject.rows };
  }

  static async getAttendance(userId, limit, offset) {
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
    return result.rows;
  }

  static async getNotifications(userId) {
    const notifs = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    const unreadRes = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    const unreadCount = parseInt(unreadRes.rows[0].count);

    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );

    return { notifications: notifs.rows, unread: unreadCount };
  }

  static async getUnreadCount(userId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = StudentDashboardModel;
