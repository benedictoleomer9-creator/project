// routes/scheduleAdmin.js — Schedule CRUD + Instructor Management
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const ScheduleAdminController = require('../controllers/scheduleAdminController');

const router = express.Router();
router.use(requireAdmin);

router.get('/list_schedules', ScheduleAdminController.listSchedules);
router.get('/schedule_detail', ScheduleAdminController.getScheduleDetail);
router.get('/live_sessions', ScheduleAdminController.getLiveSessions);
router.get('/session_students', ScheduleAdminController.getSessionStudents);
router.get('/conflict_check', ScheduleAdminController.conflictCheck);

router.get('/all_instructors', ScheduleAdminController.getAllInstructors);
router.get('/all_sections', ScheduleAdminController.getAllSections);
router.get('/all_subjects', ScheduleAdminController.getAllSubjects);
router.get('/all_readers', ScheduleAdminController.getAllReaders);

router.post('/create_schedule', ScheduleAdminController.createSchedule);
router.post('/update_schedule', ScheduleAdminController.updateSchedule);
router.post('/delete_schedule', ScheduleAdminController.deleteSchedule);

router.post('/boot_user', ScheduleAdminController.bootUser);
router.post('/close_session', ScheduleAdminController.closeSession);

// Instructor management
router.get('/list_instructors', ScheduleAdminController.listInstructors);
router.get('/pending_instructors', ScheduleAdminController.pendingInstructors);
router.post('/approve_instructor', ScheduleAdminController.approveInstructor);
router.post('/create_instructor', ScheduleAdminController.createInstructor);
router.post('/update_instructor', ScheduleAdminController.updateInstructor);
router.post('/assign_instructor_rfid', ScheduleAdminController.assignInstructorRfid);
router.post('/deactivate_instructor', ScheduleAdminController.deactivateInstructor);
router.get('/instructor_detail', ScheduleAdminController.getInstructorDetail);

module.exports = router;
