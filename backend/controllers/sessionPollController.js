const SessionPollModel = require('../models/sessionPollModel');

class SessionPollController {
  static async pollSession(req, res) {
    try {
      const sessionId = parseInt(req.query.session_id);
      if (!sessionId) return res.status(400).json({ success: false, message: 'session_id required.' });

      const sessionData = await SessionPollModel.getSessionStatus(sessionId);
      if (!sessionData) return res.status(404).json({ success: false, message: 'Session not found.' });

      const userId = parseInt(req.query.user_id) || req.session.userId;
      
      const bootData = await SessionPollModel.getBootStatus(sessionId, userId);
      const attendance = await SessionPollModel.getAttendanceStatus(sessionId, userId);
      const tappedCount = await SessionPollModel.getTappedCount(sessionId);

      res.json({
        success: true,
        session_id: sessionId,
        session_status: sessionData.status,
        session_closed: sessionData.status === 'closed',
        closed_at: sessionData.closed_at,
        is_booted: !!bootData,
        boot_reason: bootData ? bootData.reason : '',
        booted_at: bootData ? bootData.booted_at : null,
        attendance: attendance || null,
        tapped_count: tappedCount,
        polled_at: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = SessionPollController;
