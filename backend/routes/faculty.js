// routes/faculty.js — Faculty API
const express = require('express');
const { requireFaculty } = require('../middleware/auth');
const FacultyController = require('../controllers/facultyController');

const router = express.Router();
router.use(requireFaculty);

// GET /api/faculty/classes
router.get('/classes', FacultyController.getClasses);

// GET /api/faculty/attendance?schedule_id=N
router.get('/attendance', FacultyController.getAttendance);

// POST /api/faculty/manual_mark
router.post('/manual_mark', FacultyController.manualMark);

module.exports = router;
