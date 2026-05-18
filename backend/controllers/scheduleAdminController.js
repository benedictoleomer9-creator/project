const ScheduleAdminModel = require('../models/scheduleAdminModel');

class ScheduleAdminController {
  static async listSchedules(req, res) {
    try {
      const like = `%${req.query.search || ''}%`;
      const df = req.query.day || '';
      const schedules = await ScheduleAdminModel.listSchedules(like, df);
      res.json({ success: true, schedules });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getScheduleDetail(req, res) {
    try {
      const sid = parseInt(req.query.schedule_id);
      if (!sid) return res.status(400).json({ success: false, message: 'schedule_id required.' });
      const schedule = await ScheduleAdminModel.getScheduleDetail(sid);
      if (!schedule) return res.status(404).json({ success: false, message: 'Not found.' });
      
      const students = await ScheduleAdminModel.getScheduleStudents(sid, schedule.section_id);
      res.json({ success: true, schedule, students });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getLiveSessions(req, res) {
    try {
      const sessions = await ScheduleAdminModel.getLiveSessions();
      res.json({ success: true, sessions });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getSessionStudents(req, res) {
    try {
      const sid = parseInt(req.query.session_id);
      if (!sid) return res.status(400).json({ success: false, message: 'session_id required.' });
      const students = await ScheduleAdminModel.getSessionStudents(sid);
      res.json({ success: true, students });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async conflictCheck(req, res) {
    try {
      const { reader_id, day, start_time, end_time, exclude_schedule_id } = req.query;
      if (!reader_id || !day || !start_time || !end_time) return res.status(400).json({ success: false, message: 'Missing params.' });
      const c = await ScheduleAdminModel.findConflicts(parseInt(reader_id), day, start_time, end_time, parseInt(exclude_schedule_id) || 0);
      res.json({ success: true, has_conflict: c.length > 0, conflicts: c });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getAllInstructors(req, res) {
    try {
      const instructors = await ScheduleAdminModel.getAllInstructors();
      res.json({ success: true, instructors });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getAllSections(req, res) {
    try {
      const sections = await ScheduleAdminModel.getAllSections();
      res.json({ success: true, sections });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getAllSubjects(req, res) {
    try {
      const subjects = await ScheduleAdminModel.getAllSubjects();
      res.json({ success: true, subjects });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getAllReaders(req, res) {
    try {
      const readers = await ScheduleAdminModel.getAllReaders();
      res.json({ success: true, readers });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async createSchedule(req, res) {
    try {
      const b = req.body;
      const req_f = ['subject_id', 'section_id', 'faculty_id', 'reader_id', 'day_of_week', 'start_time', 'end_time'];
      for (const f of req_f) {
        if (!b[f]) return res.status(400).json({ success: false, message: `Field '${f}' required.` });
      }
      const vd = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      if (!vd.includes(b.day_of_week)) return res.status(400).json({ success: false, message: 'Invalid day.' });
      const iw = ['Saturday', 'Sunday'].includes(b.day_of_week);
      
      if (!b.force_override) {
        const c = await ScheduleAdminModel.findConflicts(parseInt(b.reader_id), b.day_of_week, b.start_time, b.end_time, 0);
        if (c.length) return res.status(409).json({ success: false, conflict: true, message: 'Conflict detected.', conflicts: c });
      }
      
      const schedule_id = await ScheduleAdminModel.createSchedule(b, iw);
      ScheduleAdminModel.logAudit(req.session.userId, 'create_schedule', 'schedules', schedule_id, { body: b }, req.ip);
      res.json({ success: true, message: 'Schedule created.', schedule_id });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async updateSchedule(req, res) {
    try {
      const b = req.body;
      const sid = parseInt(b.schedule_id);
      if (!sid) return res.status(400).json({ success: false, message: 'schedule_id required.' });
      
      const c = await ScheduleAdminModel.getSchedule(sid);
      if (!c) return res.status(404).json({ success: false, message: 'Not found.' });
      
      const day = b.day_of_week || c.day_of_week;
      const st = (b.start_time || c.start_time).slice(0, 5);
      const et = (b.end_time || c.end_time).slice(0, 5);
      const ri = parseInt(b.reader_id) || c.reader_id;
      const iw = ['Saturday', 'Sunday'].includes(day);
      
      if (!b.force_override) {
        const cf = await ScheduleAdminModel.findConflicts(ri, day, st, et, sid);
        if (cf.length) return res.status(409).json({ success: false, conflict: true, message: 'Conflict.', conflicts: cf });
      }
      
      await ScheduleAdminModel.updateSchedule(sid, b, c, day, st, et, ri, iw);
      ScheduleAdminModel.logAudit(req.session.userId, 'update_schedule', 'schedules', sid, { changes: b }, req.ip);
      res.json({ success: true, message: 'Updated.' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async deleteSchedule(req, res) {
    try {
      const sid = parseInt(req.body.schedule_id);
      if (!sid) return res.status(400).json({ success: false, message: 'schedule_id required.' });
      await ScheduleAdminModel.deleteSchedule(sid);
      ScheduleAdminModel.logAudit(req.session.userId, 'delete_schedule', 'schedules', sid, {}, req.ip);
      res.json({ success: true, message: 'Deactivated.' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async bootUser(req, res) {
    try {
      const { session_id, user_id, reason = 'Removed by administrator' } = req.body;
      if (!session_id || !user_id) return res.status(400).json({ success: false, message: 'session_id and user_id required.' });
      
      const log = await ScheduleAdminModel.getAttendanceLog(session_id, user_id);
      await ScheduleAdminModel.bootUserFromSession(session_id, user_id, req.session.userId, reason);
      
      ScheduleAdminModel.logAudit(req.session.userId, 'boot_user', 'attendance_logs', log?.log_id || 0, { session_id, user_id, reason }, req.ip);
      res.json({ success: true, message: 'User booted.' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async closeSession(req, res) {
    try {
      const sid = parseInt(req.body.session_id);
      if (!sid) return res.status(400).json({ success: false, message: 'session_id required.' });
      await ScheduleAdminModel.closeSession(sid);
      ScheduleAdminModel.logAudit(req.session.userId, 'close_session', 'class_sessions', sid, {}, req.ip);
      res.json({ success: true, message: 'Session closed.' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async listInstructors(req, res) {
    try {
      const like = `%${req.query.search || ''}%`;
      const result = await ScheduleAdminModel.listInstructors(like);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async pendingInstructors(req, res) {
    try {
      const like = `%${req.query.search || ''}%`;
      const result = await ScheduleAdminModel.pendingInstructors(like);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async approveInstructor(req, res) {
    try {
      const { user_id, card_uid } = req.body;
      if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

      const user = await ScheduleAdminModel.getPendingUser(user_id);
      if (!user) return res.status(404).json({ success: false, message: 'Pending instructor not found.' });

      const cuid = (card_uid || '').trim();
      if (cuid) {
        const inUse = await ScheduleAdminModel.checkRfidInUse(cuid);
        if (inUse) return res.status(409).json({ success: false, message: `UID '${cuid}' is already assigned.` });
      }

      const code = await ScheduleAdminModel.getNextInstructorCode();
      await ScheduleAdminModel.approveInstructor(user_id, code, user.first_name, user.last_name, user.email, user.contact_no, cuid);

      ScheduleAdminModel.logAudit(req.session.userId, 'approve_instructor', 'instructors', user_id, { card_uid: cuid }, req.ip);
      res.json({ success: true, message: 'Instructor approved and activated.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async createInstructor(req, res) {
    try {
      const b = req.body;
      if (!b.full_name || !b.department) return res.status(400).json({ success: false, message: 'full_name and department required.' });
      
      const code = await ScheduleAdminModel.getNextInstructorCode();
      const email = (b.email || '').trim() || null;
      const rfid = (b.rfid_uid || '').trim() || null;
      
      if (email) {
        const inUse = await ScheduleAdminModel.checkInstructorEmailInUse(email);
        if (inUse) return res.status(409).json({ success: false, message: 'Email in use.' });
      }
      if (rfid) {
        const inUse = await ScheduleAdminModel.checkInstructorRfidInUse(rfid);
        if (inUse) return res.status(409).json({ success: false, message: 'RFID in use.' });
      }
      
      const instructor_id = await ScheduleAdminModel.createInstructor(b.user_id, code, b.full_name, b.department, b.specialization, email, b.contact_no, rfid);
      
      ScheduleAdminModel.logAudit(req.session.userId, 'create_instructor', 'instructors', instructor_id, { full_name: b.full_name }, req.ip);
      res.json({ success: true, message: 'Created.', instructor_id, instructor_code: code });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async updateInstructor(req, res) {
    try {
      const b = req.body;
      const iid = parseInt(b.instructor_id);
      if (!iid) return res.status(400).json({ success: false, message: 'instructor_id required.' });
      
      const c = await ScheduleAdminModel.getInstructor(iid);
      if (!c) return res.status(404).json({ success: false, message: 'Not found.' });
      
      const email = b.email !== undefined ? ((b.email || '').trim() || null) : c.email;
      if (email && email !== c.email) {
        const inUse = await ScheduleAdminModel.checkInstructorEmailInUse(email, iid);
        if (inUse) return res.status(409).json({ success: false, message: 'Email in use.' });
      }
      
      await ScheduleAdminModel.updateInstructor(iid, b, c, email);
      
      ScheduleAdminModel.logAudit(req.session.userId, 'update_instructor', 'instructors', iid, b, req.ip);
      res.json({ success: true, message: 'Updated.' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async assignInstructorRfid(req, res) {
    try {
      const { instructor_id, rfid_uid } = req.body;
      if (!instructor_id || !rfid_uid) return res.status(400).json({ success: false, message: 'instructor_id and rfid_uid required.' });
      
      const uid = rfid_uid.trim();
      const dup = await ScheduleAdminModel.checkInstructorRfidInUse(uid, instructor_id);
      if (dup) return res.status(409).json({ success: false, message: `Already assigned to ${dup.full_name}.` });
      
      await ScheduleAdminModel.assignInstructorRfid(instructor_id, uid);
      
      ScheduleAdminModel.logAudit(req.session.userId, 'assign_instructor_rfid', 'instructors', parseInt(instructor_id), { rfid_uid: uid }, req.ip);
      res.json({ success: true, message: 'RFID assigned.' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async deactivateInstructor(req, res) {
    try {
      const iid = parseInt(req.body.instructor_id);
      if (!iid) return res.status(400).json({ success: false, message: 'instructor_id required.' });
      
      await ScheduleAdminModel.deactivateInstructor(iid);
      
      ScheduleAdminModel.logAudit(req.session.userId, 'deactivate_instructor', 'instructors', iid, {}, req.ip);
      res.json({ success: true, message: 'Deactivated.' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async getInstructorDetail(req, res) {
    try {
      const iid = parseInt(req.query.instructor_id);
      if (!iid) return res.status(400).json({ success: false, message: 'instructor_id required.' });
      
      const result = await ScheduleAdminModel.getInstructorDetail(iid);
      if (!result) return res.status(404).json({ success: false, message: 'Not found.' });
      
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}

module.exports = ScheduleAdminController;
