// routes/dashboard.js — Admin Dashboard API
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const DashboardController = require('../controllers/dashboardController');

const router = express.Router();
router.use(requireAdmin);

// GET /api/dashboard/stats
router.get('/stats', DashboardController.getStats);

// GET /api/dashboard/logs
router.get('/logs', DashboardController.getLogs);

// GET /api/dashboard/students
router.get('/students', DashboardController.getStudents);

// GET /api/dashboard/pending_students
router.get('/pending_students', DashboardController.getPendingStudents);

// POST /api/dashboard/assign_uid
router.post('/assign_uid', DashboardController.assignUid);

// GET /api/dashboard/readers
router.get('/readers', DashboardController.getReaders);

// GET /api/dashboard/schedules
router.get('/schedules', DashboardController.getSchedules);

// GET /api/dashboard/subjects
router.get('/subjects', DashboardController.getSubjects);

// GET /api/dashboard/sections
router.get('/sections', DashboardController.getSections);

// GET /api/dashboard/audit
router.get('/audit', DashboardController.getAuditLogs);

module.exports = router;
