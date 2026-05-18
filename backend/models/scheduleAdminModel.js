const { pool, auditLog } = require('../config/db');

function pgBool(v) { return v === true || v === 'true' || v === 't' || v === '1'; }

class ScheduleAdminModel {
  static async findConflicts(rid, day, st, et, exId) {
    const s = st.slice(0, 5), e = et.slice(0, 5);
    const r = await pool.query(`SELECT s.schedule_id,s.day_of_week,s.start_time::text,s.end_time::text,
      sub.subject_name,sec.section_name,u.first_name||' '||u.last_name AS faculty_name
      FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id
      JOIN sections sec ON sec.section_id=s.section_id JOIN users u ON u.user_id=s.faculty_id
      WHERE s.reader_id=$1 AND s.day_of_week=$2 AND s.is_active=TRUE AND s.schedule_id!=$3
      AND(($4::time>=s.start_time AND $4::time<s.end_time)OR($5::time>s.start_time AND $5::time<=s.end_time)
      OR($4::time<=s.start_time AND $5::time>=s.end_time))`, [rid, day, exId, s, e]);
    return r.rows;
  }

  static async listSchedules(like, df) {
    let sql = `SELECT s.schedule_id,s.day_of_week,s.start_time::text AS start_time,s.end_time::text AS end_time,
    s.late_minutes,s.is_active,s.is_weekend_session,sub.subject_id,sub.subject_code,sub.subject_name,sub.units,
    sec.section_id,sec.section_name,sec.year_level,sec.course,rr.reader_id,rr.reader_code,
    rr.location AS room_location,rr.weekend_restricted,u.user_id AS faculty_id,
    u.first_name||' '||u.last_name AS faculty_name,u.student_id AS faculty_code,i.instructor_id,i.department,
    i.rfid_uid AS instructor_rfid_uid,
    (SELECT COUNT(*) FROM enrollments e WHERE e.section_id=s.section_id) AS enrolled_count,
    (SELECT cs.status FROM class_sessions cs WHERE cs.schedule_id=s.schedule_id AND cs.session_date=CURRENT_DATE LIMIT 1) AS today_session_status,
    (SELECT cs.session_id FROM class_sessions cs WHERE cs.schedule_id=s.schedule_id AND cs.session_date=CURRENT_DATE LIMIT 1) AS today_session_id
    FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id
    JOIN rfid_readers rr ON rr.reader_id=s.reader_id JOIN users u ON u.user_id=s.faculty_id
    LEFT JOIN instructors i ON i.user_id=s.faculty_id
    WHERE(sub.subject_name ILIKE $1 OR sub.subject_code ILIKE $1 OR sec.section_name ILIKE $1 OR u.last_name ILIKE $1 OR rr.reader_code ILIKE $1)`;
    const p = [like];
    if (df) { sql += ` AND s.day_of_week=$2`; p.push(df); }
    sql += ` ORDER BY CASE s.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END,s.start_time`;
    const r = await pool.query(sql, p); 
    return r.rows;
  }

  static async getScheduleDetail(sid) {
    const s = await pool.query(`SELECT s.*,s.start_time::text AS start_time,s.end_time::text AS end_time,sub.subject_code,sub.subject_name,sec.section_name,sec.course,sec.year_level,rr.reader_code,rr.location AS room_location,rr.weekend_restricted,u.first_name||' '||u.last_name AS faculty_name,i.department,i.rfid_uid AS instructor_rfid_uid FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id JOIN rfid_readers rr ON rr.reader_id=s.reader_id JOIN users u ON u.user_id=s.faculty_id LEFT JOIN instructors i ON i.user_id=s.faculty_id WHERE s.schedule_id=$1`, [sid]);
    return s.rows[0];
  }

  static async getScheduleStudents(sid, sectionId) {
    const st = await pool.query(`SELECT u.user_id,u.student_id,u.first_name,u.last_name,rc.card_uid,(SELECT al.status FROM attendance_logs al JOIN class_sessions cs ON cs.session_id=al.session_id WHERE cs.schedule_id=$1 AND cs.session_date=CURRENT_DATE AND al.user_id=u.user_id LIMIT 1) AS today_status,(SELECT al.tap_time FROM attendance_logs al JOIN class_sessions cs ON cs.session_id=al.session_id WHERE cs.schedule_id=$1 AND cs.session_date=CURRENT_DATE AND al.user_id=u.user_id LIMIT 1) AS tap_time FROM enrollments e JOIN users u ON u.user_id=e.user_id LEFT JOIN rfid_cards rc ON rc.user_id=u.user_id AND rc.is_active=TRUE WHERE e.section_id=$2 ORDER BY u.last_name`, [sid, sectionId]);
    return st.rows;
  }

  static async getLiveSessions() {
    const r = await pool.query(`SELECT cs.session_id,cs.session_date::text,cs.opened_at,cs.status,s.schedule_id,s.day_of_week,s.start_time::text,s.end_time::text,s.is_weekend_session,sub.subject_code,sub.subject_name,sec.section_name,rr.reader_code,rr.location AS room_location,u.first_name||' '||u.last_name AS faculty_name,COUNT(al.log_id) AS tapped_count,(SELECT COUNT(*) FROM enrollments e WHERE e.section_id=s.section_id) AS enrolled_count FROM class_sessions cs JOIN schedules s ON s.schedule_id=cs.schedule_id JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id JOIN rfid_readers rr ON rr.reader_id=s.reader_id JOIN users u ON u.user_id=s.faculty_id LEFT JOIN attendance_logs al ON al.session_id=cs.session_id WHERE cs.session_date=CURRENT_DATE GROUP BY cs.session_id,s.schedule_id,sub.subject_id,sec.section_id,rr.reader_id,u.user_id ORDER BY cs.opened_at DESC`);
    return r.rows;
  }

  static async getSessionStudents(sid) {
    const r = await pool.query(`SELECT al.log_id,al.status,al.tap_time,al.recorded_by,u.user_id,u.student_id,u.first_name||' '||u.last_name AS full_name,EXISTS(SELECT 1 FROM session_boots sb WHERE sb.session_id=al.session_id AND sb.user_id=al.user_id) AS is_booted FROM attendance_logs al JOIN users u ON u.user_id=al.user_id WHERE al.session_id=$1 ORDER BY al.tap_time ASC`, [sid]);
    return r.rows;
  }

  static async getAllInstructors() {
    const r = await pool.query(`SELECT u.user_id,u.student_id,u.first_name||' '||u.last_name AS name,COALESCE(i.department,'CTE') AS department FROM users u LEFT JOIN instructors i ON i.user_id=u.user_id WHERE u.role='faculty' AND u.is_active=TRUE ORDER BY u.last_name`);
    return r.rows;
  }

  static async getAllSections() {
    const r = await pool.query("SELECT section_id,section_name,course,year_level FROM sections WHERE is_active=TRUE ORDER BY section_name");
    return r.rows;
  }

  static async getAllSubjects() {
    const r = await pool.query("SELECT subject_id,subject_code,subject_name FROM subjects WHERE is_active=TRUE ORDER BY subject_code");
    return r.rows;
  }

  static async getAllReaders() {
    const r = await pool.query("SELECT reader_id,reader_code,location,weekend_restricted FROM rfid_readers WHERE is_active=TRUE ORDER BY reader_code");
    return r.rows;
  }

  static async createSchedule(b, iw) {
    const r = await pool.query(`INSERT INTO schedules(subject_id,section_id,faculty_id,reader_id,day_of_week,start_time,end_time,late_minutes,is_weekend_session,is_active)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING schedule_id`, [parseInt(b.subject_id), parseInt(b.section_id), parseInt(b.faculty_id), parseInt(b.reader_id), b.day_of_week, b.start_time, b.end_time, parseInt(b.late_minutes) || 15, iw]);
    return r.rows[0].schedule_id;
  }

  static async getSchedule(sid) {
    const cu = await pool.query(`SELECT *,start_time::text AS start_time,end_time::text AS end_time FROM schedules WHERE schedule_id=$1`, [sid]);
    return cu.rows[0];
  }

  static async updateSchedule(sid, b, c, day, st, et, ri, iw) {
    await pool.query(`UPDATE schedules SET subject_id=$1,section_id=$2,faculty_id=$3,reader_id=$4,day_of_week=$5,start_time=$6,end_time=$7,late_minutes=$8,is_weekend_session=$9,is_active=$10 WHERE schedule_id=$11`,
      [parseInt(b.subject_id) || c.subject_id, parseInt(b.section_id) || c.section_id, parseInt(b.faculty_id) || c.faculty_id, ri, day, st, et, parseInt(b.late_minutes) || c.late_minutes, iw, b.is_active !== undefined ? pgBool(b.is_active) : c.is_active, sid]);
  }

  static async deleteSchedule(sid) {
    await pool.query('UPDATE schedules SET is_active=FALSE WHERE schedule_id=$1', [sid]);
  }

  static async getAttendanceLog(session_id, user_id) {
    const lc = await pool.query('SELECT log_id FROM attendance_logs WHERE session_id=$1 AND user_id=$2', [session_id, user_id]);
    return lc.rows[0];
  }

  static async bootUserFromSession(session_id, user_id, adminId, reason) {
    await pool.query('DELETE FROM attendance_logs WHERE session_id=$1 AND user_id=$2', [session_id, user_id]);
    await pool.query(`INSERT INTO session_boots(session_id,user_id,booted_by,reason,booted_at)VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(session_id,user_id) DO UPDATE SET booted_at=NOW(),reason=EXCLUDED.reason,booted_by=EXCLUDED.booted_by`, [session_id, user_id, adminId, reason.trim()]);
    await pool.query("INSERT INTO notifications(user_id,title,message,type)VALUES($1,'🚫 Removed from Session',$2,'absent')", [user_id, `Removed from session. Reason: ${reason.trim()}`]);
  }

  static async closeSession(sid) {
    await pool.query("UPDATE class_sessions SET status='closed',closed_at=NOW() WHERE session_id=$1", [sid]);
  }

  static async listInstructors(like) {
    const r = await pool.query(`SELECT i.*,u.user_id,u.student_id AS faculty_login_id,u.is_active AS account_active,(SELECT COUNT(*) FROM schedules s WHERE s.faculty_id=i.user_id AND s.is_active=TRUE) AS active_schedules FROM instructors i LEFT JOIN users u ON u.user_id=i.user_id WHERE i.is_active=TRUE AND (i.full_name ILIKE $1 OR i.instructor_code ILIKE $1 OR i.department ILIKE $1 OR i.email ILIKE $1) ORDER BY i.full_name`, [like]);
    const cnt = await pool.query("SELECT COUNT(*) FROM instructors WHERE is_active=TRUE");
    return { instructors: r.rows, total: parseInt(cnt.rows[0].count) };
  }

  static async pendingInstructors(like) {
    const result = await pool.query(`
    SELECT u.user_id, u.student_id, u.first_name, u.last_name, u.email,
           u.contact_no, u.status, u.created_at
    FROM users u
    WHERE u.role = 'faculty' AND u.status = 'pending'
      AND (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.student_id ILIKE $1)
    ORDER BY u.created_at DESC
  `, [like]);
    const countRes = await pool.query("SELECT COUNT(*) FROM users WHERE role='faculty' AND status='pending'");
    return { instructors: result.rows, pending_count: parseInt(countRes.rows[0].count) };
  }

  static async getPendingUser(user_id) {
    const userCheck = await pool.query("SELECT * FROM users WHERE user_id = $1 AND role = 'faculty' AND status = 'pending'", [user_id]);
    return userCheck.rows[0];
  }

  static async checkRfidInUse(cuid) {
    const dupCheck = await pool.query("SELECT rc.card_id FROM rfid_cards rc WHERE rc.card_uid = $1 AND rc.is_active = TRUE", [cuid]);
    return dupCheck.rows.length > 0;
  }

  static async getNextInstructorCode() {
    const lc = await pool.query("SELECT instructor_code FROM instructors ORDER BY instructor_id DESC LIMIT 1");
    const nn = lc.rows.length ? (parseInt(lc.rows[0].instructor_code.slice(-4)) + 1) : 1;
    return `FAC-${new Date().getFullYear()}-${String(nn).padStart(4, '0')}`;
  }

  static async approveInstructor(user_id, code, first_name, last_name, email, contact_no, cuid) {
    await pool.query(`
        INSERT INTO instructors(user_id, instructor_code, full_name, department, email, contact_no, rfid_uid, rfid_assigned_at, is_active)
        VALUES($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 IS NOT NULL THEN NOW() ELSE NULL END, TRUE)
    `, [user_id, code, `${first_name} ${last_name}`, 'College of Teacher Education', email, contact_no, cuid || null]);
    if (cuid) {
      await pool.query("INSERT INTO rfid_cards (card_uid, user_id, is_active) VALUES ($1, $2, TRUE)", [cuid, user_id]);
    }
    await pool.query("UPDATE users SET status = 'active', is_active = TRUE, updated_at = NOW() WHERE user_id = $1", [user_id]);
  }

  static async checkInstructorEmailInUse(email, excludeIid = null) {
    let q = "SELECT 1 FROM instructors WHERE email=$1";
    let p = [email];
    if (excludeIid) {
        q += " AND instructor_id!=$2";
        p.push(excludeIid);
    }
    const ec = await pool.query(q, p);
    return ec.rows.length > 0;
  }

  static async checkInstructorRfidInUse(rfid, excludeIid = null) {
    let q = "SELECT instructor_id,full_name FROM instructors WHERE rfid_uid=$1";
    let p = [rfid];
    if (excludeIid) {
        q += " AND instructor_id!=$2";
        p.push(excludeIid);
    }
    const rc = await pool.query(q, p);
    return rc.rows[0];
  }

  static async createInstructor(user_id, code, full_name, department, specialization, email, contact_no, rfid) {
    const r = await pool.query(`INSERT INTO instructors(user_id,instructor_code,full_name,department,specialization,email,contact_no,rfid_uid,rfid_assigned_at,is_active)VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8 IS NOT NULL THEN NOW() ELSE NULL END,TRUE) RETURNING instructor_id`,
      [user_id ? parseInt(user_id) : null, code, full_name.trim(), department.trim(), (specialization || '').trim() || null, email, (contact_no || '').trim() || null, rfid]);
    return r.rows[0].instructor_id;
  }

  static async getInstructor(iid) {
    const cu = await pool.query("SELECT * FROM instructors WHERE instructor_id=$1", [iid]);
    return cu.rows[0];
  }

  static async updateInstructor(iid, b, c, email) {
    await pool.query(`UPDATE instructors SET full_name=$1,department=$2,specialization=$3,email=$4,contact_no=$5,user_id=$6 WHERE instructor_id=$7`,
      [b.full_name || c.full_name, b.department || c.department, b.specialization !== undefined ? ((b.specialization || '').trim() || null) : c.specialization, email, b.contact_no !== undefined ? ((b.contact_no || '').trim() || null) : c.contact_no, b.user_id !== undefined ? (parseInt(b.user_id) || null) : c.user_id, iid]);
  }

  static async assignInstructorRfid(instructor_id, uid) {
    await pool.query("UPDATE instructors SET rfid_uid=$1,rfid_assigned_at=NOW() WHERE instructor_id=$2", [uid, instructor_id]);
  }

  static async deactivateInstructor(iid) {
    await pool.query("UPDATE instructors SET is_active=FALSE WHERE instructor_id=$1", [iid]);
  }

  static async getInstructorDetail(iid) {
    const i = await pool.query(`SELECT i.*,u.student_id AS faculty_login_id,u.is_active AS account_active FROM instructors i LEFT JOIN users u ON u.user_id=i.user_id WHERE i.instructor_id=$1`, [iid]);
    if (!i.rows.length) return null;
    const instructor = i.rows[0];
    const sc = await pool.query(`SELECT s.schedule_id,s.day_of_week,s.start_time::text,s.end_time::text,s.is_weekend_session,s.is_active,sub.subject_code,sub.subject_name,sec.section_name,rr.reader_code FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id JOIN rfid_readers rr ON rr.reader_id=s.reader_id WHERE s.faculty_id=$1 AND s.is_active=TRUE ORDER BY CASE s.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END,s.start_time`, [instructor.user_id || 0]);
    return { instructor, schedules: sc.rows };
  }

  static logAudit(userId, action, table, id, details, ip) {
    auditLog(userId, action, table, id, details, ip);
  }
}
module.exports = ScheduleAdminModel;
