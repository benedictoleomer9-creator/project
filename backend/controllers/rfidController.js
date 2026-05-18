const RfidModel = require('../models/rfidModel');

class RfidController {
  static async processTap(req, res) {
    try {
      const { card_uid, reader_code } = req.body;
      if (!card_uid || !reader_code) {
        return res.status(400).json({ success: false, message: 'card_uid and reader_code are required.' });
      }

      const cardUid = card_uid.trim();
      const readerCode = reader_code.trim();

      // 1. Validate RFID card
      const card = await RfidModel.validateCard(cardUid);
      if (!card) {
        RfidModel.logAudit(null, 'rfid_tap_unknown', 'rfid_cards', 0, { card_uid: cardUid, reader: readerCode });
        return res.status(404).json({ success: false, message: 'Unrecognized or inactive RFID card.' });
      }

      // 2. Find reader
      const reader = await RfidModel.getReader(readerCode);
      if (!reader) {
        return res.status(404).json({ success: false, message: 'Unknown reader code.' });
      }

      // 3. Current day/time in Manila timezone
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = days[now.getDay()];
      const currentTime = now.toTimeString().slice(0, 8);

      // 4. Weekend access control
      const isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek);
      if (isWeekend && reader.weekend_restricted) {
        RfidModel.logAudit(card.user_id, 'rfid_tap_weekend_blocked', 'rfid_readers', reader.reader_id, {
          card_uid: cardUid, reader: readerCode, day_of_week: dayOfWeek, reason: 'Reader is weekend-restricted'
        });
        return res.status(403).json({ success: false, message: `Access denied. Reader '${readerCode}' does not allow weekend access on ${dayOfWeek}.` });
      }

      // 5. Find active schedule
      const schedule = await RfidModel.getActiveSchedule(reader.reader_id, dayOfWeek, currentTime);
      if (!schedule) {
        const timeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return res.status(404).json({ success: false, message: `No active class at ${readerCode} on ${dayOfWeek} at ${timeFormatted}.` });
      }

      // 6. Get or create class session
      const session = await RfidModel.getOrCreateSession(schedule.schedule_id);

      // 7. Check duplicate tap
      const existing = await RfidModel.checkDuplicateTap(session.session_id, card.user_id);
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Already recorded: ${card.first_name} ${card.last_name} is marked ${existing.status} for this session.`,
          status: existing.status,
          tap_time: existing.tap_time,
        });
      }

      // 8. Determine present / late
      const startParts = schedule.start_time.split(':');
      const scheduleStart = new Date(now);
      scheduleStart.setHours(parseInt(startParts[0]), parseInt(startParts[1]), parseInt(startParts[2] || 0), 0);
      const lateThreshold = new Date(scheduleStart.getTime() + schedule.late_minutes * 60000);
      const attendanceStatus = (now <= lateThreshold) ? 'present' : 'late';

      // 9. Record attendance
      const log = await RfidModel.recordAttendance(session.session_id, card.user_id, cardUid, attendanceStatus);

      // 10. Create notification
      const tapTime = new Date(log.tap_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
      const weekendNote = schedule.is_weekend_session ? ' [Weekend Session]' : '';

      const notifTitle = attendanceStatus === 'present'
        ? `✅ Attendance Recorded — ${schedule.subject_code}${weekendNote}`
        : `⚠️ Late Arrival — ${schedule.subject_code}${weekendNote}`;

      const notifMessage = attendanceStatus === 'present'
        ? `You were marked PRESENT for ${schedule.subject_name} (${schedule.section_name}) at ${tapTime} on ${dayOfWeek}.`
        : `You were marked LATE for ${schedule.subject_name} (${schedule.section_name}) at ${tapTime}. Class started at ${scheduleStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`;

      await RfidModel.createNotification(card.user_id, notifTitle, notifMessage, attendanceStatus);

      RfidModel.logAudit(card.user_id, 'rfid_tap', 'attendance_logs', log.log_id, {
        card_uid: cardUid, reader: readerCode, status: attendanceStatus,
        day_of_week: dayOfWeek, is_weekend: isWeekend, is_weekend_session: !!schedule.is_weekend_session,
      });

      res.json({
        success: true,
        message: `${card.first_name} ${card.last_name} — ${attendanceStatus.toUpperCase()}`,
        data: {
          log_id: log.log_id,
          student: `${card.first_name} ${card.last_name}`,
          student_id: card.student_id,
          subject: schedule.subject_name,
          subject_code: schedule.subject_code,
          section: schedule.section_name,
          status: attendanceStatus,
          tap_time: tapTime,
          session_id: session.session_id,
          day_of_week: dayOfWeek,
          is_weekend_session: !!schedule.is_weekend_session,
        },
      });
    } catch (err) {
      console.error('RFID tap error:', err);
      res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
  }
}

module.exports = RfidController;
