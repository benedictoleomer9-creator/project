const StudentDashboardModel = require('../models/studentDashboardModel');

class StudentDashboardController {
  static async uploadProfilePicture(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded or invalid file format.' });
      }
      const userId = req.session.userId;
      const filename = req.file.filename;

      await StudentDashboardModel.updateProfilePicture(userId, filename);
      res.json({ success: true, message: 'Profile picture updated successfully', profile_picture: filename });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getProfile(req, res) {
    try {
      const userId = req.session.userId;
      const user = await StudentDashboardModel.getProfile(userId);
      if (user) delete user.password_hash;
      res.json({ success: true, profile: user });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getStats(req, res) {
    try {
      const userId = req.session.userId;
      const data = await StudentDashboardModel.getStats(userId);
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getAttendance(req, res) {
    try {
      const userId = req.session.userId;
      const limit = parseInt(req.query.limit) || 30;
      const offset = parseInt(req.query.offset) || 0;

      const attendance = await StudentDashboardModel.getAttendance(userId, limit, offset);
      res.json({ success: true, attendance });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getNotifications(req, res) {
    try {
      const userId = req.session.userId;
      const data = await StudentDashboardModel.getNotifications(userId);
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getUnreadCount(req, res) {
    try {
      const userId = req.session.userId;
      const unread = await StudentDashboardModel.getUnreadCount(userId);
      res.json({ success: true, unread });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = StudentDashboardController;
