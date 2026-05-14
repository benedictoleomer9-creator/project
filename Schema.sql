-- CTED RFID ATTENDANCE SYSTEM — PostgreSQL Schema (FINAL)
-- College of Teacher Education
--
-- Compatible with ALL files:
--   admin.php, index.php, student.php, faculty.php,
--   dashboard.php, schedule_admin.php, faculty_api.php,
--   student_dashboard.php, rfid_tap.php, session_poll.php,
--   login.php, logout.php
--
-- Usage:
--   createdb cted_attendance_db
--   psql -U postgres -d cted_attendance_db -f schema.sql
 
-- Create schema
CREATE SCHEMA IF NOT EXISTS attendance;
SET search_path TO attendance, public;
 
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
 
-- UTILITY FUNCTIONS
 
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 

-- TABLE: users
-- Used by: login.php, dashboard.php, schedule_admin.php,
--          rfid_tap.php, student_dashboard.php, faculty_api.php
--
-- Columns verified against:
--   login.php       → student_id, password_hash, role, is_active,
--                      status, first_name, last_name, user_id
--   login.php reg   → student_id, first_name, last_name, email,
--                      password_hash, gender, date_of_birth,
--                      address, guardian_name, contact_no,
--                      role, is_active, status
--   dashboard.php   → role, is_active, status, card_uid (via join)
--   schedule_admin  → user_id, first_name, last_name, role,
--                      is_active (for all_instructors query)

CREATE TABLE users (
    user_id        SERIAL       PRIMARY KEY,
    student_id     VARCHAR(20)  UNIQUE NOT NULL,
    first_name     VARCHAR(80)  NOT NULL,
    last_name      VARCHAR(80)  NOT NULL,
    email          VARCHAR(120) UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(20)  NOT NULL DEFAULT 'student'
                   CHECK (role IN ('admin', 'faculty', 'student')),
    gender         VARCHAR(10),
    date_of_birth  DATE,
    address        TEXT,
    guardian_name  VARCHAR(160),
    contact_no     VARCHAR(20),
    is_active      BOOLEAN      NOT NULL DEFAULT FALSE,
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'inactive')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
 
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
 
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_users_role       ON users(role);
CREATE INDEX idx_users_status     ON users(status);
 
-- TABLE: instructors
-- Used by: schedule_admin.php (all_instructors, list_instructors,
--          instructor_detail, create_instructor, update_instructor,
--          assign_instructor_rfid, deactivate_instructor)
--          admin.php JS (instructor cards, RFID modal)
--
-- Columns verified against:
--   schedule_admin  → instructor_id, user_id, instructor_code,
--                      full_name, department, specialization,
--                      email, contact_no, rfid_uid,
--                      rfid_assigned_at, is_active,
--                      created_at, updated_at
--   admin.php JS    → instructor_id, full_name, instructor_code,
--                      department, specialization, email,
--                      contact_no, rfid_uid, is_active,
--                      active_schedules (computed via subquery)

CREATE TABLE instructors (
    instructor_id    SERIAL       PRIMARY KEY,
    user_id          INT          UNIQUE REFERENCES users(user_id) ON DELETE SET NULL,
    instructor_code  VARCHAR(30)  UNIQUE NOT NULL,
    full_name        VARCHAR(200) NOT NULL,
    department       VARCHAR(120) NOT NULL DEFAULT 'College of Teacher Education',
    specialization   VARCHAR(200),
    email            VARCHAR(120) UNIQUE,
    contact_no       VARCHAR(20),
    rfid_uid         VARCHAR(50)  UNIQUE,
    rfid_assigned_at TIMESTAMPTZ,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
 
CREATE TRIGGER trg_instructors_updated_at
    BEFORE UPDATE ON instructors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
 
CREATE INDEX idx_instructors_rfid_uid ON instructors(rfid_uid) WHERE rfid_uid IS NOT NULL;
CREATE INDEX idx_instructors_user_id  ON instructors(user_id)  WHERE user_id  IS NOT NULL;
CREATE INDEX idx_instructors_dept     ON instructors(department);
 

-- TABLE: rfid_cards
-- Used by: rfid_tap.php, dashboard.php (assign_uid, assign_card),
--          student_dashboard.php (profile), schedule_admin.php
--
-- Columns verified against:
--   rfid_tap.php     → card_id, user_id, card_uid, is_active
--   dashboard.php    → card_uid, user_id, is_active
--   student_dash.php → card_uid (LEFT JOIN on user_id)

CREATE TABLE rfid_cards (
    card_id   SERIAL      PRIMARY KEY,
    card_uid  VARCHAR(50) UNIQUE NOT NULL,
    user_id   INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_active BOOLEAN     NOT NULL DEFAULT TRUE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_rfid_cards_uid     ON rfid_cards(card_uid);
CREATE INDEX idx_rfid_cards_user_id ON rfid_cards(user_id);
 

-- TABLE: rfid_readers
-- Used by: rfid_tap.php, dashboard.php (readers),
--          schedule_admin.php (all_readers, list_schedules,
--          live_sessions, conflict_check)
--          admin.php JS (RFID simulator dropdown)
--
-- Columns verified against:
--   rfid_tap.php    → reader_id, reader_code, location,
--                      weekend_restricted, is_active
--   schedule_admin  → reader_id, reader_code, location,
--                      weekend_restricted, is_active
--   admin.php JS    → reader_id, reader_code, location

CREATE TABLE rfid_readers (
    reader_id          SERIAL      PRIMARY KEY,
    reader_code        VARCHAR(50) UNIQUE NOT NULL,
    location           VARCHAR(120),
    is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
    weekend_restricted BOOLEAN     NOT NULL DEFAULT FALSE
);
 

-- TABLE: subjects
-- Used by: schedule_admin.php (all_subjects, list_schedules),
--          rfid_tap.php (JOIN), dashboard.php (subjects, logs),
--          student_dashboard.php (attendance, stats)
--
-- Columns verified against all files:
--   → subject_id, subject_code, subject_name, units, is_active

CREATE TABLE subjects (
    subject_id   SERIAL      PRIMARY KEY,
    subject_code VARCHAR(30) UNIQUE NOT NULL,
    subject_name VARCHAR(120) NOT NULL,
    units        SMALLINT    NOT NULL DEFAULT 3,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE
);
 

-- TABLE: sections
-- Used by: schedule_admin.php (all_sections, list_schedules),
--          rfid_tap.php (JOIN), dashboard.php (sections, logs),
--          student_dashboard.php (attendance)
--
-- Columns verified against all files:
--   → section_id, section_name, year_level, course,
--     school_year, adviser_id, is_active

CREATE TABLE sections (
    section_id   SERIAL      PRIMARY KEY,
    section_name VARCHAR(50) NOT NULL,
    year_level   SMALLINT,
    course       VARCHAR(80),
    school_year  VARCHAR(20) NOT NULL DEFAULT '2025-2026',
    adviser_id   INT         REFERENCES users(user_id) ON DELETE SET NULL,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE
);
 

-- TABLE: enrollments
-- Used by: schedule_admin.php (schedule_detail — enrolled count,
--          session_students — who is in a section)
--          student_dashboard.php (implicit via section)
--
-- Columns verified against:
--   schedule_admin → enrollment_id, user_id, section_id,
--                    school_year

CREATE TABLE enrollments (
    enrollment_id SERIAL      PRIMARY KEY,
    user_id       INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    section_id    INT         NOT NULL REFERENCES sections(section_id) ON DELETE CASCADE,
    school_year   VARCHAR(20) NOT NULL DEFAULT '2025-2026',
    UNIQUE(user_id, section_id, school_year)
);
 
CREATE INDEX idx_enrollments_user    ON enrollments(user_id);
CREATE INDEX idx_enrollments_section ON enrollments(section_id);
 

-- TABLE: schedules
-- Used by: rfid_tap.php, schedule_admin.php (ALL schedule actions),
--          dashboard.php (schedules), faculty_api.php (classes),
--          admin.php JS (schedule form sends these exact columns)
--
-- CRITICAL: admin.php sends faculty_id (NOT instructor_id).
--           faculty_api.php also correctly uses faculty_id.
--           The column is named faculty_id to match all files.
--
-- Columns verified against:
--   schedule_admin INSERT → subject_id, section_id, faculty_id,
--                           reader_id, day_of_week, start_time,
--                           end_time, late_minutes,
--                           is_weekend_session, is_active
--   schedule_admin UPDATE → same as above + schedule_id
--   rfid_tap.php          → reader_id, day_of_week, start_time,
--                           end_time, is_active, is_weekend_session,
--                           late_minutes, faculty_id
--   dashboard.php         → faculty_id (JOIN to users)
--   faculty_api.php       → faculty_id (WHERE clause)
--   admin.php JS          → schedule_id, subject_id, section_id,
--                           faculty_id, reader_id, day_of_week,
--                           start_time, end_time, late_minutes,
--                           is_weekend_session

CREATE TABLE schedules (
    schedule_id        SERIAL      PRIMARY KEY,
    subject_id         INT         NOT NULL REFERENCES subjects(subject_id),
    section_id         INT         NOT NULL REFERENCES sections(section_id),
    -- faculty_id references users.user_id (role='faculty')
    faculty_id         INT         NOT NULL REFERENCES users(user_id),
    reader_id          INT         NOT NULL REFERENCES rfid_readers(reader_id),
    day_of_week        VARCHAR(15) NOT NULL
                       CHECK (day_of_week IN (
                           'Monday','Tuesday','Wednesday',
                           'Thursday','Friday','Saturday','Sunday'
                       )),
    start_time         TIME        NOT NULL,
    end_time           TIME        NOT NULL,
    late_minutes       SMALLINT    NOT NULL DEFAULT 15,
    is_weekend_session BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active          BOOLEAN     NOT NULL DEFAULT TRUE
);
 
CREATE INDEX idx_schedules_reader        ON schedules(reader_id);
CREATE INDEX idx_schedules_faculty       ON schedules(faculty_id);
CREATE INDEX idx_schedules_section       ON schedules(section_id);
CREATE INDEX idx_schedules_day           ON schedules(day_of_week);
CREATE INDEX idx_schedules_weekend       ON schedules(is_weekend_session)
    WHERE is_weekend_session = TRUE;
 

-- TABLE: class_sessions
-- Used by: rfid_tap.php, schedule_admin.php (live_sessions,
--          session_students, close_session), faculty_api.php
--          (manual_mark), dashboard.php (logs, stats),
--          session_poll.php
--
-- Columns verified against all files:
--   → session_id, schedule_id, session_date, opened_at,
--     closed_at, status

CREATE TABLE class_sessions (
    session_id   SERIAL      PRIMARY KEY,
    schedule_id  INT         NOT NULL REFERENCES schedules(schedule_id),
    session_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at    TIMESTAMPTZ,
    status       VARCHAR(20) NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'closed'))
);
 
CREATE INDEX idx_class_sessions_schedule ON class_sessions(schedule_id);
CREATE INDEX idx_class_sessions_date     ON class_sessions(session_date);
CREATE INDEX idx_class_sessions_status   ON class_sessions(status);
 

-- TABLE: attendance_logs
-- Used by: rfid_tap.php (INSERT), schedule_admin.php
--          (session_students, boot_user), faculty_api.php
--          (attendance, manual_mark), dashboard.php (logs, stats),
--          student_dashboard.php (attendance, stats),
--          session_poll.php (tapped_count, attendance status)
--
-- Columns verified against all files:
--   → log_id, session_id, user_id, card_uid, tap_time,
--     status, recorded_by
--   UNIQUE(session_id, user_id) — enforced in rfid_tap.php
--   and faculty_api.php ON CONFLICT clause

CREATE TABLE attendance_logs (
    log_id      SERIAL      PRIMARY KEY,
    session_id  INT         NOT NULL REFERENCES class_sessions(session_id),
    user_id     INT         NOT NULL REFERENCES users(user_id),
    card_uid    VARCHAR(50) NOT NULL,
    tap_time    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      VARCHAR(10) NOT NULL DEFAULT 'present'
                CHECK (status IN ('present', 'late', 'absent')),
    recorded_by VARCHAR(30) NOT NULL DEFAULT 'rfid',
    UNIQUE(session_id, user_id)
);
 
CREATE INDEX idx_attendance_session  ON attendance_logs(session_id);
CREATE INDEX idx_attendance_user     ON attendance_logs(user_id);
CREATE INDEX idx_attendance_tap_time ON attendance_logs(tap_time);
 

-- TABLE: notifications
-- Used by: rfid_tap.php (INSERT), student_dashboard.php
--          (notifications action), schedule_admin.php (boot_user)
--
-- Columns verified against all files:
--   → notification_id, user_id, title, message, type,
--     is_read, created_at

CREATE TABLE notifications (
    notification_id SERIAL       PRIMARY KEY,
    user_id         INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title           VARCHAR(120) NOT NULL,
    message         TEXT         NOT NULL,
    type            VARCHAR(20)  NOT NULL DEFAULT 'info'
                    CHECK (type IN ('info', 'absent', 'late', 'success', 'present')),
    is_read         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
 

-- TABLE: audit_logs
-- Used by: db_connection.php auditLog(), dashboard.php (audit),
--          login.php, logout.php, rfid_tap.php, schedule_admin.php,
--          faculty_api.php
--
-- Columns verified against all files:
--   → audit_id, user_id, action, table_name, record_id,
--     details (JSONB), ip_address, created_at

CREATE TABLE audit_logs (
    audit_id   SERIAL      PRIMARY KEY,
    user_id    INT         REFERENCES users(user_id) ON DELETE SET NULL,
    action     VARCHAR(80) NOT NULL,
    table_name VARCHAR(60),
    record_id  INT,
    details    JSON,      -- Standard JSON type
    meta       JSONB,     -- Binary JSONB type
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_audit_logs_user       ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
 

-- TABLE: session_boots
-- Used by: schedule_admin.php (boot_user action),
--          session_poll.php (checks if user was booted)
--
-- Columns verified against:
--   schedule_admin  → session_id, user_id, booted_by, reason,
--                      booted_at
--   session_poll    → session_id, user_id, reason, booted_at

CREATE TABLE session_boots (
    boot_id    SERIAL      PRIMARY KEY,
    session_id INT         NOT NULL REFERENCES class_sessions(session_id) ON DELETE CASCADE,
    user_id    INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    booted_by  INT         NOT NULL REFERENCES users(user_id),
    reason     TEXT        NOT NULL DEFAULT 'Removed by administrator',
    booted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);
 
CREATE INDEX idx_session_boots ON session_boots(session_id, user_id);
 
 
-- SEED DATA
 
--  ADMIN USER 
-- Credentials: ADMIN-001 / Earl123
-- Hash generated with: password_hash('Earl123', PASSWORD_BCRYPT, ['cost'=>12])
INSERT INTO users (
    student_id, first_name, last_name, email,
    password_hash, role, is_active, status
) VALUES (
    'ADMIN-001', 'System', 'Admin', 'admin@cted.edu.ph',
    '$2y$12$.jUHWZrnMhIRWucPUpgAcusN0L2/nq24yo7RZRFDiIRXkpERMzoL2',
    'admin', TRUE, 'active'
);
 
--  RFID READERS 
-- weekend_restricted=FALSE → readers accept all 7 days
INSERT INTO rfid_readers (reader_code, location, is_active, weekend_restricted) VALUES
    ('RDR-CTE-101',  'Room 101 — CTED Building',  TRUE, FALSE),
    ('RDR-CTE-102',  'Room 102 — CTED Building',  TRUE, FALSE),
    ('RDR-CTE-103',  'Room 103 — CTED Building',  TRUE, FALSE),
    ('RDR-CTE-LAB1', 'Computer Lab 1',             TRUE, FALSE);
 
--  SUBJECTS 
INSERT INTO subjects (subject_code, subject_name, units) VALUES
    ('EDUC101', 'The Teaching Profession',         3),
    ('EDUC102', 'Child and Adolescent Learners',   3),
    ('EDUC103', 'The Teacher and the School',      3),
    ('MATH101', 'Mathematics in the Modern World', 3),
    ('ENGL101', 'Purposive Communication',         3);
 
--  SECTIONS 
INSERT INTO sections (section_name, year_level, course, school_year) VALUES
    ('1-A', 1, 'Bachelor of Elementary Education', '2025-2026'),
    ('1-B', 1, 'Bachelor of Secondary Education',  '2025-2026'),
    ('2-A', 2, 'Bachelor of Elementary Education', '2025-2026'),
    ('2-B', 2, 'Bachelor of Secondary Education',  '2025-2026');
 
--  SAMPLE FACULTY USER 
-- Credentials: FAC-001 / Faculty123
-- This creates a faculty login AND an instructors record so the
-- Schedule Manager dropdown is populated immediately on first run.
INSERT INTO users (
    student_id, first_name, last_name, email,
    password_hash, role, is_active, status
) VALUES (
    'FAC-001', 'Mark', 'Mascardo', 'markmascardo@gmail.com',
    '$2y$12$ctlilV4CACCDeRlfqYFJv.btycJAytdsjOe5xhuprvvrvkv9dPsTi',
    'faculty', TRUE, 'active'
) RETURNING user_id;
 
-- Insert into instructors table (links faculty user to instructor profile)
-- Uses the user_id of the faculty user inserted above
INSERT INTO instructors (
    user_id, instructor_code, full_name, department,
    specialization, email, contact_no, is_active
)
SELECT
    u.user_id,
    'FAC-' || date_part('year', NOW())::text || '-0001',
    u.first_name || ' ' || u.last_name,
    'College of Teacher Education',
    'Mathematics Education',
    u.email,
    NULL,
    TRUE
FROM users u
WHERE u.student_id = 'FAC-001';
 
--  RFID CARDS FOR SAMPLE STUDENTS 
INSERT INTO rfid_cards (card_uid, user_id, is_active)
SELECT 'CARD-' || LPAD(u.user_id::text, 6, '0'), u.user_id, TRUE
FROM users u
WHERE u.role = 'student' AND u.status = 'active';
 
--  ENROLL STUDENTS INTO SECTIONS 
INSERT INTO enrollments (user_id, section_id, school_year)
SELECT u.user_id, s.section_id, '2025-2026'
FROM users u
CROSS JOIN sections s
WHERE u.student_id IN ('25-A-001','25-A-002','25-A-003')
  AND s.section_name = '1-A'
ON CONFLICT DO NOTHING;
 
INSERT INTO enrollments (user_id, section_id, school_year)
SELECT u.user_id, s.section_id, '2025-2026'
FROM users u
CROSS JOIN sections s
WHERE u.student_id IN ('25-A-004','25-A-005')
  AND s.section_name = '2-B'
ON CONFLICT DO NOTHING;
 
--  SAMPLE SCHEDULE 
-- Requires: faculty user (FAC-001), subject, section, reader
-- This makes the Schedule Manager functional immediately.
INSERT INTO schedules (
    subject_id, section_id, faculty_id, reader_id,
    day_of_week, start_time, end_time, late_minutes,
    is_weekend_session, is_active
)
SELECT
    sub.subject_id,
    sec.section_id,
    u.user_id,
    r.reader_id,
    'Monday',
    '08:00:00',
    '09:30:00',
    15,
    FALSE,
    TRUE
FROM
    subjects sub,
    sections sec,
    users u,
    rfid_readers r
WHERE
    sub.subject_code = 'MATH101'
    AND sec.section_name = '1-A'
    AND u.student_id = 'FAC-001'
    AND r.reader_code = 'RDR-CTE-101';
 
-- Sunday schedule example (demonstrates Sunday support)
INSERT INTO schedules (
    subject_id, section_id, faculty_id, reader_id,
    day_of_week, start_time, end_time, late_minutes,
    is_weekend_session, is_active
)
SELECT
    sub.subject_id,
    sec.section_id,
    u.user_id,
    r.reader_id,
    'Sunday',
    '08:00:00',
    '10:00:00',
    15,
    TRUE,
    TRUE
FROM
    subjects sub,
    sections sec,
    users u,
    rfid_readers r
WHERE
    sub.subject_code = 'MATH101'
    AND sec.section_name = '2-B'
    AND u.student_id = 'FAC-001'
    AND r.reader_code = 'RDR-CTE-LAB1';
 
 
 
-- VERIFICATION QUERIES
-- Run these after setup to confirm everything is correct.
 
 
SELECT '=== TABLES ===' AS info;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'attendance'
ORDER BY table_name;
 
SELECT '=== USER COUNTS BY ROLE/STATUS ===' AS info;
SELECT role, status, COUNT(*) AS count
FROM users
GROUP BY role, status
ORDER BY role, status;
 
SELECT '=== INSTRUCTORS ===' AS info;
SELECT i.instructor_id, i.instructor_code, i.full_name,
       u.student_id AS linked_login, i.is_active
FROM instructors i
LEFT JOIN users u ON u.user_id = i.user_id;
 
SELECT '=== SCHEDULES ===' AS info;
SELECT sc.schedule_id, sub.subject_code, sec.section_name,
       u.first_name || ' ' || u.last_name AS faculty,
       rr.reader_code, sc.day_of_week,
       sc.start_time, sc.end_time, sc.is_weekend_session
FROM schedules sc
JOIN subjects sub ON sub.subject_id = sc.subject_id
JOIN sections sec ON sec.section_id = sc.section_id
JOIN users u      ON u.user_id      = sc.faculty_id
JOIN rfid_readers rr ON rr.reader_id = sc.reader_id
ORDER BY sc.day_of_week, sc.start_time;
 
SELECT '=== RFID CARDS ===' AS info;
SELECT rc.card_uid, u.student_id, u.first_name || ' ' || u.last_name AS name
FROM rfid_cards rc
JOIN users u ON u.user_id = rc.user_id
ORDER BY u.student_id;