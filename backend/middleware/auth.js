// middleware/auth.js — Authentication guards

/** Require any logged-in user */
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Login required.' });
  }
  next();
}

/** Require admin role */
function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

/** Require faculty role */
function requireFaculty(req, res, next) {
  if (!req.session || req.session.role !== 'faculty') {
    return res.status(403).json({ success: false, message: 'Faculty access required.' });
  }
  next();
}

/** Require student (block admin from student-only endpoints) */
function requireStudent(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Login required.' });
  }
  if (req.session.role === 'admin') {
    return res.status(403).json({ success: false, message: 'This endpoint is for students only.' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin, requireFaculty, requireStudent };
