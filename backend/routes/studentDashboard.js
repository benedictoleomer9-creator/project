// routes/studentDashboard.js — Student API
const express = require('express');
const { requireStudent } = require('../middleware/auth');
const StudentDashboardController = require('../controllers/studentDashboardController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.session.userId + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
      cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg and .jpeg format allowed!'), false);
    }
  }
});

const router = express.Router();
router.use(requireStudent);

// POST /api/student/upload_profile_picture
router.post('/upload_profile_picture', upload.single('profile_picture'), StudentDashboardController.uploadProfilePicture);

// GET /api/student/profile
router.get('/profile', StudentDashboardController.getProfile);

// GET /api/student/stats
router.get('/stats', StudentDashboardController.getStats);

// GET /api/student/attendance
router.get('/attendance', StudentDashboardController.getAttendance);

// GET /api/student/notifications
router.get('/notifications', StudentDashboardController.getNotifications);

// GET /api/student/unread_count
router.get('/unread_count', StudentDashboardController.getUnreadCount);

module.exports = router;
