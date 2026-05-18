const DashboardModel = require('../models/dashboardModel');

class DashboardController {
  static async getStats(req, res) {
    try {
      let date = req.query.date || new Date().toISOString().split('T')[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = new Date().toISOString().split('T')[0];

      const stats = await DashboardModel.getDailyStats(date);
      const weekly = await DashboardModel.getWeeklyStats();

      res.json({ success: true, stats, weekly });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getLogs(req, res) {
    try {
      let date = req.query.date || new Date().toISOString().split('T')[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = new Date().toISOString().split('T')[0];
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const { logs, total } = await DashboardModel.getLogs(date, limit, offset);

      res.json({ success: true, logs, total });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getStudents(req, res) {
    try {
      const search = req.query.search || '';
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const like = `%${search}%`;

      const students = await DashboardModel.getStudents(like, limit, offset);

      res.json({ success: true, students });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getPendingStudents(req, res) {
    try {
      const search = req.query.search || '';
      const like = `%${search}%`;

      const { students, pending_count } = await DashboardModel.getPendingStudents(like);

      res.json({ success: true, students, pending_count });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async assignUid(req, res) {
    try {
      const { user_id, card_uid } = req.body;
      if (!user_id || !card_uid) {
        return res.status(400).json({ success: false, message: 'user_id and card_uid are required.' });
      }

      const cuid = card_uid.trim();

      // Check duplicate
      const duplicate = await DashboardModel.checkDuplicateUid(cuid, user_id);
      if (duplicate) {
        return res.status(409).json({ success: false, message: `UID '${cuid}' is already assigned to student ${duplicate.student_id}.` });
      }

      await DashboardModel.assignRfidUid(user_id, cuid);

      DashboardModel.logAudit(req.session.userId, 'assign_uid', 'rfid_cards', parseInt(user_id), { card_uid: cuid, activated_user_id: user_id }, req.ip);
      res.json({ success: true, message: 'RFID card assigned and student account activated.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getReaders(req, res) {
    try {
      const readers = await DashboardModel.getReaders();
      res.json({ success: true, readers });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getSchedules(req, res) {
    try {
      const schedules = await DashboardModel.getSchedules();
      res.json({ success: true, schedules });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getSubjects(req, res) {
    try {
      const subjects = await DashboardModel.getSubjects();
      res.json({ success: true, subjects });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getSections(req, res) {
    try {
      const sections = await DashboardModel.getSections();
      res.json({ success: true, sections });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getAuditLogs(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const logs = await DashboardModel.getAuditLogs(limit, offset);

      res.json({ success: true, logs });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = DashboardController;
