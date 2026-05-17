// config/db.js — PostgreSQL connection pool + helpers
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');


const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'cted_attendance_db',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASS || ''),
});

// Set search_path on every new client
pool.on('connect', (client) => {
  client.query('SET search_path TO attendance, public');
});

/**
 * Audit log helper
 */
async function auditLog(userId, action, tableName = '', recordId = 0, details = {}, ip = null) {
  try {
    // Construct a meta JSONB object to demonstrate the use of JSONB
    const meta = { 
      logged_at: new Date().toISOString(), 
      ip_address: ip 
    };

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, details, meta, ip_address)
       VALUES ($1, $2, $3, $4, $5::json, $6::jsonb, $7)`,
      [
        userId || null,
        action,
        tableName || null,
        recordId || null,
        Object.keys(details).length ? JSON.stringify(details) : null,
        JSON.stringify(meta),
        ip || null,
      ]
    );
  } catch (err) {
    console.error('auditLog error:', err.message);
  }
}

module.exports = { pool, auditLog };
