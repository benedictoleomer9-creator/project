// routes/rfidTap.js — Core RFID attendance recording endpoint
const express = require('express');
const RfidController = require('../controllers/rfidController');

const router = express.Router();

// POST /api/rfid/tap
router.post('/tap', RfidController.processTap);

module.exports = router;
