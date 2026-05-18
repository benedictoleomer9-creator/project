const FacultyModel = require('../models/facultyModel');

class FacultyController {
  static async getClasses(req, res) {
    try {
      const facultyId = req.session.userId;
      const classes = await FacultyModel.getClasses(facultyId);
      res.json({ success: true, classes });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getAttendance(req, res) {
    try {
      const facultyId = req.session.userId;
      const schedId = parseInt(req.query.schedule_id);
      if (!schedId) return res.status(400).json({ success: false, message: 'schedule_id required.' });

      // Ownership check
      const isOwner = await FacultyModel.checkScheduleOwnership(schedId, facultyId);
      if (!isOwner) return res.status(403).json({ success: false, message: 'Unauthorized schedule.' });

      const logs = await FacultyModel.getAttendance(schedId);
      res.json({ success: true, logs });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async manualMark(req, res) {
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
      const isOwner = await FacultyModel.checkScheduleOwnership(schedule_id, facultyId);
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this schedule.' });
      }

      // Find or create session
      const sessionId = await FacultyModel.getOrCreateSession(schedule_id);

      // Insert/update attendance
      await FacultyModel.recordManualAttendance(sessionId, student_id, status);

      FacultyModel.logAudit(facultyId, 'manual_attendance', 'attendance_logs', student_id, { status }, req.ip);
      res.json({ success: true, message: 'Attendance updated manually.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = FacultyController;
