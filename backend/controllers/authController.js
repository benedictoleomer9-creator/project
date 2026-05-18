const bcrypt = require('bcryptjs');
const AuthModel = require('../models/authModel');

class AuthController {
  static async login(req, res) {
    try {
      const { student_id, password } = req.body;
      if (!student_id || !password) {
        return res.status(400).json({ success: false, message: 'Student ID and password are required.' });
      }

      const user = await AuthModel.getUserByStudentId(student_id);

      if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) {
        return res.status(401).json({ success: false, message: 'Invalid Student ID or password.' });
      }

      const userStatus = user.status || (user.is_active ? 'active' : 'inactive');
      if (userStatus === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your account is pending approval. An admin must assign your RFID card before you can log in.',
          status: 'pending',
        });
      }
      if (userStatus === 'inactive' || !user.is_active) {
        return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact an administrator.' });
      }

      // Regenerate session
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ success: false, message: 'Session error.' });

        req.session.userId = user.user_id;
        req.session.studentId = user.student_id;
        req.session.role = user.role;
        req.session.name = `${user.first_name || ''} ${user.last_name || ''}`.trim();

        AuthModel.logAudit(user.user_id, 'login', '', 0, {}, req.ip);

        res.json({
          success: true,
          message: 'Login successful.',
          user: {
            user_id: user.user_id,
            student_id: user.student_id,
            name: req.session.name,
            role: user.role,
          },
        });
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
  }

  static async register(req, res) {
    try {
      const { student_id, first_name, last_name, password, email, gender, date_of_birth, address, guardian_name, contact_no } = req.body;

      const required = ['student_id', 'first_name', 'last_name', 'password'];
      for (const field of required) {
        if (!req.body[field]) {
          return res.status(400).json({ success: false, message: `Field '${field}' is required.` });
        }
      }

      const sid = student_id.trim();
      if (!/^[A-Za-z0-9\-]{3,20}$/.test(sid)) {
        return res.status(400).json({ success: false, message: 'Student ID may only contain letters, numbers, and dashes (3–20 characters).' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }

      // Check duplicate student_id
      const isSidDuplicate = await AuthModel.checkDuplicateStudentId(sid);
      if (isSidDuplicate) {
        return res.status(409).json({ success: false, message: 'Student ID already registered.' });
      }

      // Check duplicate email
      const emailVal = (email || '').trim() || null;
      if (emailVal) {
        const isEmailDuplicate = await AuthModel.checkDuplicateEmail(emailVal);
        if (isEmailDuplicate) {
          return res.status(409).json({ success: false, message: 'Email address is already registered.' });
        }
      }

      let role = (req.body.role || 'student').toLowerCase();
      if (role === 'instructor') role = 'faculty';
      if (!['student', 'faculty'].includes(role)) role = 'student';

      const hash = await bcrypt.hash(password, 12);

      const userId = await AuthModel.registerUser(
        sid, (first_name || '').trim(), (last_name || '').trim(), emailVal, hash,
        gender || null, date_of_birth || null, address || null, guardian_name || null, contact_no || null, role
      );

      AuthModel.logAudit(userId, 'register', 'users', userId, {}, req.ip);

      res.json({
        success: true,
        message: 'Registration successful! Your account is pending admin approval.',
        user_id: userId,
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
  }

  static logout(req, res) {
    const userId = req.session?.userId || null;
    AuthModel.logAudit(userId, 'logout', '', 0, {}, req.ip);
    req.session.destroy(() => {
      res.json({ success: true, message: 'Logged out successfully.' });
    });
  }
}

module.exports = AuthController;
