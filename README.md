# CTED RFID Attendance System
## College of Teacher Education

---

## 📁 Project Structure

```
project/
├── Schema.sql              ← PostgreSQL schema + seed data
├── db_connection.php       ← DB connection + search_path fix + helpers
├── login.php               ← Login & Registration API
├── logout.php              ← Session logout
├── rfid_tap.php            ← 🔴 Core RFID tap handler
├── dashboard.php           ← Admin API (stats, logs, students, RFID assign)
├── schedule_admin.php      ← Schedule CRUD + Instructor management API
├── faculty_api.php         ← Faculty API (classes, attendance, manual mark)
├── student_dashboard.php   ← Student API (profile, stats, notifications)
├── session_poll.php        ← Real-time session & boot polling
├── index.php               ← Login + Registration UI (auto-redirects if logged in)
├── admin.php               ← Admin Dashboard UI (session-guarded)
├── student.php             ← Student Portal UI (session-guarded)
├── faculty.php             ← Faculty Portal UI (session-guarded)
├── hash_generator.php      ← Utility: generate bcrypt hashes (dev only)
├── test.php                ← Diagnostic test page (dev only — DELETE in prod)
├── jrmsu_logo.jpg          ← University logo
├── ogol.jpg                ← CTED logo
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. Requirements
- PHP 8.1+
- PostgreSQL 14+
- Web server (Apache/Nginx) or PHP built-in server

### 2. Database Setup
```bash
createdb cted_attendance
psql -U postgres -d cted_attendance -f backend/schema.sql
```

### 3. Configure Database Connection
Set environment variables (do NOT hardcode your password):
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=cted_attendance
export DB_USER=postgres
export DB_PASS=your_password
```

Or edit `backend/db_connection.php` and replace the empty `DB_PASS` default.

### 4. Run the Server
```bash
# From project root (cted_rfid/)
php -S localhost:8000 -t frontend/
```

Then open: **http://localhost:8000/index.php**

> **Apache/Nginx:** Place the entire `cted_rfid/` folder in your web root (e.g., `htdocs/cted_rfid/`).
> Access at `http://localhost/cted_rfid/frontend/index.php`

---

## 🔐 Default Admin Login
| Field      | Value       |
|------------|-------------|
| Student ID | `ADMIN-001` |
| Password   | `Earl123`   |

> ⚠️ Change the admin password immediately after first login.

---

## 🐛 Bugs Fixed

| File | Bug | Fix |
|------|-----|-----|
| `student.html` | File contained PHP backend code (wrong file) | Rebuilt as proper `student.php` HTML frontend |
| `index.html → index.php` | `.html` can't do PHP session redirects | Converted to `.php` with auto-redirect on login |
| `admin.html → admin.php` | No session check — unauthenticated access possible | PHP session guard added, redirects to `index.php` |
| `db_connection.php` | Missing `SET search_path TO attendance, public` — all queries failed with "table not found" | Added `search_path` after PDO connection |
| `db_connection.php` | Hardcoded password `leomer` | Cleared; use env var `DB_PASS` |
| `dashboard.php` | Auth guard rejected valid session-based admin logins | Fixed to check `$_SESSION['role'] === 'admin'` properly |
| `login.php` | Missing CORS OPTIONS preflight before `session_start()` | Preflight handled before session |
| `login.php` | No session ID regeneration on login (session fixation risk) | Added `session_regenerate_id(true)` |
| `login.php` | Empty `date_of_birth` sent as empty string causing DB error | Coerced to `null` |
| `student_dashboard.php` | Unread notification count queried AFTER marking read → always 0 | Count moved before the UPDATE |
| All fetch calls | Missing `credentials: 'same-origin'` → session cookie not sent | Added to all `fetch()` calls |
| `student.php` / `admin.php` | `API` pointed to `./backend` which may not resolve correctly | Path verified and consistent |

---

## 📡 RFID Tap API

**Endpoint:** `POST /backend/rfid_tap.php`

**Body:**
```json
{
  "card_uid": "A1B2C3D4",
  "reader_code": "RDR-CTE-101"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Juan Dela Cruz — PRESENT",
  "data": {
    "student": "Juan Dela Cruz",
    "student_id": "25-A-12345",
    "subject": "The Teaching Profession",
    "section": "BSED-1A",
    "status": "present",
    "tap_time": "08:02 AM"
  }
}
```

---

## 🔒 Security Notes
- Passwords hashed with bcrypt (cost 12)
- Session ID regenerated on login (prevents session fixation)
- RBAC enforced: admin pages redirect to login if session missing
- SQL injection prevented via PDO prepared statements
- All actions logged in `audit_logs`
- DB password loaded from environment variable (not hardcoded)

---

*Built for College of Teacher Education — RFID Attendance System*
