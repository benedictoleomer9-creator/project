const { pool, auditLog } = require('../config/db');

class AuthModel {
  static async getUserByStudentId(student_id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE student_id = $1 LIMIT 1', [student_id.trim()]);
    return rows[0];
  }

  static async checkDuplicateStudentId(student_id) {
    const dupCheck = await pool.query('SELECT 1 FROM users WHERE student_id = $1', [student_id]);
    return dupCheck.rows.length > 0;
  }

  static async checkDuplicateEmail(email) {
    if (!email) return false;
    const emailCheck = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    return emailCheck.rows.length > 0;
  }

  static async registerUser(sid, first_name, last_name, email, hash, gender, date_of_birth, address, guardian_name, contact_no, role) {
    const result = await pool.query(
      `INSERT INTO users (student_id, first_name, last_name, email, password_hash,
       gender, date_of_birth, address, guardian_name, contact_no, role, is_active, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,'pending') RETURNING user_id`,
      [sid, first_name, last_name, email, hash, gender, date_of_birth, address, guardian_name, contact_no, role]
    );
    return result.rows[0].user_id;
  }

  static logAudit(userId, action, targetTable, targetId, details, ip) {
    auditLog(userId, action, targetTable, targetId, details, ip);
  }
}

module.exports = AuthModel;
