// routes/scheduleAdmin.js — Schedule CRUD + Instructor Management
const express = require('express');
const { pool, auditLog } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(requireAdmin);

function pgBool(v){return v===true||v==='true'||v==='t'||v==='1';}
async function findConflicts(rid,day,st,et,exId){
  const s=st.slice(0,5),e=et.slice(0,5);
  const r=await pool.query(`SELECT s.schedule_id,s.day_of_week,s.start_time::text,s.end_time::text,
    sub.subject_name,sec.section_name,u.first_name||' '||u.last_name AS faculty_name
    FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id
    JOIN sections sec ON sec.section_id=s.section_id JOIN users u ON u.user_id=s.faculty_id
    WHERE s.reader_id=$1 AND s.day_of_week=$2 AND s.is_active=TRUE AND s.schedule_id!=$3
    AND(($4::time>=s.start_time AND $4::time<s.end_time)OR($5::time>s.start_time AND $5::time<=s.end_time)
    OR($4::time<=s.start_time AND $5::time>=s.end_time))`,[rid,day,exId,s,e]);
  return r.rows;
}

router.get('/list_schedules',async(req,res)=>{try{
  const like=`%${req.query.search||''}%`,df=req.query.day||'';
  let sql=`SELECT s.schedule_id,s.day_of_week,s.start_time::text AS start_time,s.end_time::text AS end_time,
    s.late_minutes,s.is_active,s.is_weekend_session,sub.subject_id,sub.subject_code,sub.subject_name,sub.units,
    sec.section_id,sec.section_name,sec.year_level,sec.course,rr.reader_id,rr.reader_code,
    rr.location AS room_location,rr.weekend_restricted,u.user_id AS faculty_id,
    u.first_name||' '||u.last_name AS faculty_name,u.student_id AS faculty_code,i.instructor_id,i.department,
    i.rfid_uid AS instructor_rfid_uid,
    (SELECT COUNT(*) FROM enrollments e WHERE e.section_id=s.section_id) AS enrolled_count,
    (SELECT cs.status FROM class_sessions cs WHERE cs.schedule_id=s.schedule_id AND cs.session_date=CURRENT_DATE LIMIT 1) AS today_session_status,
    (SELECT cs.session_id FROM class_sessions cs WHERE cs.schedule_id=s.schedule_id AND cs.session_date=CURRENT_DATE LIMIT 1) AS today_session_id
    FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id
    JOIN rfid_readers rr ON rr.reader_id=s.reader_id JOIN users u ON u.user_id=s.faculty_id
    LEFT JOIN instructors i ON i.user_id=s.faculty_id
    WHERE(sub.subject_name ILIKE $1 OR sub.subject_code ILIKE $1 OR sec.section_name ILIKE $1 OR u.last_name ILIKE $1 OR rr.reader_code ILIKE $1)`;
  const p=[like];
  if(df){sql+=` AND s.day_of_week=$2`;p.push(df);}
  sql+=` ORDER BY CASE s.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END,s.start_time`;
  const r=await pool.query(sql,p);res.json({success:true,schedules:r.rows});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.get('/schedule_detail',async(req,res)=>{try{
  const sid=parseInt(req.query.schedule_id);if(!sid)return res.status(400).json({success:false,message:'schedule_id required.'});
  const s=await pool.query(`SELECT s.*,s.start_time::text AS start_time,s.end_time::text AS end_time,sub.subject_code,sub.subject_name,sec.section_name,sec.course,sec.year_level,rr.reader_code,rr.location AS room_location,rr.weekend_restricted,u.first_name||' '||u.last_name AS faculty_name,i.department,i.rfid_uid AS instructor_rfid_uid FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id JOIN rfid_readers rr ON rr.reader_id=s.reader_id JOIN users u ON u.user_id=s.faculty_id LEFT JOIN instructors i ON i.user_id=s.faculty_id WHERE s.schedule_id=$1`,[sid]);
  if(!s.rows.length)return res.status(404).json({success:false,message:'Not found.'});
  const sch=s.rows[0];
  const st=await pool.query(`SELECT u.user_id,u.student_id,u.first_name,u.last_name,rc.card_uid,(SELECT al.status FROM attendance_logs al JOIN class_sessions cs ON cs.session_id=al.session_id WHERE cs.schedule_id=$1 AND cs.session_date=CURRENT_DATE AND al.user_id=u.user_id LIMIT 1) AS today_status,(SELECT al.tap_time FROM attendance_logs al JOIN class_sessions cs ON cs.session_id=al.session_id WHERE cs.schedule_id=$1 AND cs.session_date=CURRENT_DATE AND al.user_id=u.user_id LIMIT 1) AS tap_time FROM enrollments e JOIN users u ON u.user_id=e.user_id LEFT JOIN rfid_cards rc ON rc.user_id=u.user_id AND rc.is_active=TRUE WHERE e.section_id=$2 ORDER BY u.last_name`,[sid,sch.section_id]);
  res.json({success:true,schedule:sch,students:st.rows});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.get('/live_sessions',async(req,res)=>{try{
  const r=await pool.query(`SELECT cs.session_id,cs.session_date::text,cs.opened_at,cs.status,s.schedule_id,s.day_of_week,s.start_time::text,s.end_time::text,s.is_weekend_session,sub.subject_code,sub.subject_name,sec.section_name,rr.reader_code,rr.location AS room_location,u.first_name||' '||u.last_name AS faculty_name,COUNT(al.log_id) AS tapped_count,(SELECT COUNT(*) FROM enrollments e WHERE e.section_id=s.section_id) AS enrolled_count FROM class_sessions cs JOIN schedules s ON s.schedule_id=cs.schedule_id JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id JOIN rfid_readers rr ON rr.reader_id=s.reader_id JOIN users u ON u.user_id=s.faculty_id LEFT JOIN attendance_logs al ON al.session_id=cs.session_id WHERE cs.session_date=CURRENT_DATE GROUP BY cs.session_id,s.schedule_id,sub.subject_id,sec.section_id,rr.reader_id,u.user_id ORDER BY cs.opened_at DESC`);
  res.json({success:true,sessions:r.rows});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.get('/session_students',async(req,res)=>{try{
  const sid=parseInt(req.query.session_id);if(!sid)return res.status(400).json({success:false,message:'session_id required.'});
  const r=await pool.query(`SELECT al.log_id,al.status,al.tap_time,al.recorded_by,u.user_id,u.student_id,u.first_name||' '||u.last_name AS full_name,EXISTS(SELECT 1 FROM session_boots sb WHERE sb.session_id=al.session_id AND sb.user_id=al.user_id) AS is_booted FROM attendance_logs al JOIN users u ON u.user_id=al.user_id WHERE al.session_id=$1 ORDER BY al.tap_time ASC`,[sid]);
  res.json({success:true,students:r.rows});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.get('/conflict_check',async(req,res)=>{try{
  const{reader_id,day,start_time,end_time,exclude_schedule_id}=req.query;
  if(!reader_id||!day||!start_time||!end_time)return res.status(400).json({success:false,message:'Missing params.'});
  const c=await findConflicts(parseInt(reader_id),day,start_time,end_time,parseInt(exclude_schedule_id)||0);
  res.json({success:true,has_conflict:c.length>0,conflicts:c});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.get('/all_instructors',async(req,res)=>{try{const r=await pool.query(`SELECT u.user_id,u.student_id,u.first_name||' '||u.last_name AS name,COALESCE(i.department,'CTE') AS department FROM users u LEFT JOIN instructors i ON i.user_id=u.user_id WHERE u.role='faculty' AND u.is_active=TRUE ORDER BY u.last_name`);res.json({success:true,instructors:r.rows});}catch(e){res.status(500).json({success:false,message:e.message});}});
router.get('/all_sections',async(req,res)=>{try{const r=await pool.query("SELECT section_id,section_name,course,year_level FROM sections WHERE is_active=TRUE ORDER BY section_name");res.json({success:true,sections:r.rows});}catch(e){res.status(500).json({success:false,message:e.message});}});
router.get('/all_subjects',async(req,res)=>{try{const r=await pool.query("SELECT subject_id,subject_code,subject_name FROM subjects WHERE is_active=TRUE ORDER BY subject_code");res.json({success:true,subjects:r.rows});}catch(e){res.status(500).json({success:false,message:e.message});}});
router.get('/all_readers',async(req,res)=>{try{const r=await pool.query("SELECT reader_id,reader_code,location,weekend_restricted FROM rfid_readers WHERE is_active=TRUE ORDER BY reader_code");res.json({success:true,readers:r.rows});}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/create_schedule',async(req,res)=>{try{
  const b=req.body;const req_f=['subject_id','section_id','faculty_id','reader_id','day_of_week','start_time','end_time'];
  for(const f of req_f){if(!b[f])return res.status(400).json({success:false,message:`Field '${f}' required.`});}
  const vd=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  if(!vd.includes(b.day_of_week))return res.status(400).json({success:false,message:'Invalid day.'});
  const iw=['Saturday','Sunday'].includes(b.day_of_week);
  if(!b.force_override){const c=await findConflicts(parseInt(b.reader_id),b.day_of_week,b.start_time,b.end_time,0);if(c.length)return res.status(409).json({success:false,conflict:true,message:'Conflict detected.',conflicts:c});}
  const r=await pool.query(`INSERT INTO schedules(subject_id,section_id,faculty_id,reader_id,day_of_week,start_time,end_time,late_minutes,is_weekend_session,is_active)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING schedule_id`,[parseInt(b.subject_id),parseInt(b.section_id),parseInt(b.faculty_id),parseInt(b.reader_id),b.day_of_week,b.start_time,b.end_time,parseInt(b.late_minutes)||15,iw]);
  auditLog(req.session.userId,'create_schedule','schedules',r.rows[0].schedule_id,{body:b},req.ip);
  res.json({success:true,message:'Schedule created.',schedule_id:r.rows[0].schedule_id});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/update_schedule',async(req,res)=>{try{
  const b=req.body;const sid=parseInt(b.schedule_id);if(!sid)return res.status(400).json({success:false,message:'schedule_id required.'});
  const cu=await pool.query(`SELECT *,start_time::text AS start_time,end_time::text AS end_time FROM schedules WHERE schedule_id=$1`,[sid]);
  if(!cu.rows.length)return res.status(404).json({success:false,message:'Not found.'});const c=cu.rows[0];
  const day=b.day_of_week||c.day_of_week,st=(b.start_time||c.start_time).slice(0,5),et=(b.end_time||c.end_time).slice(0,5),ri=parseInt(b.reader_id)||c.reader_id;
  const iw=['Saturday','Sunday'].includes(day);
  if(!b.force_override){const cf=await findConflicts(ri,day,st,et,sid);if(cf.length)return res.status(409).json({success:false,conflict:true,message:'Conflict.',conflicts:cf});}
  await pool.query(`UPDATE schedules SET subject_id=$1,section_id=$2,faculty_id=$3,reader_id=$4,day_of_week=$5,start_time=$6,end_time=$7,late_minutes=$8,is_weekend_session=$9,is_active=$10 WHERE schedule_id=$11`,
    [parseInt(b.subject_id)||c.subject_id,parseInt(b.section_id)||c.section_id,parseInt(b.faculty_id)||c.faculty_id,ri,day,st,et,parseInt(b.late_minutes)||c.late_minutes,iw,b.is_active!==undefined?pgBool(b.is_active):c.is_active,sid]);
  auditLog(req.session.userId,'update_schedule','schedules',sid,{changes:b},req.ip);res.json({success:true,message:'Updated.'});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/delete_schedule',async(req,res)=>{try{const sid=parseInt(req.body.schedule_id);if(!sid)return res.status(400).json({success:false,message:'schedule_id required.'});await pool.query('UPDATE schedules SET is_active=FALSE WHERE schedule_id=$1',[sid]);auditLog(req.session.userId,'delete_schedule','schedules',sid,{},req.ip);res.json({success:true,message:'Deactivated.'});}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/boot_user',async(req,res)=>{try{
  const{session_id,user_id,reason='Removed by administrator'}=req.body;
  if(!session_id||!user_id)return res.status(400).json({success:false,message:'session_id and user_id required.'});
  const lc=await pool.query('SELECT log_id FROM attendance_logs WHERE session_id=$1 AND user_id=$2',[session_id,user_id]);
  await pool.query('DELETE FROM attendance_logs WHERE session_id=$1 AND user_id=$2',[session_id,user_id]);
  await pool.query(`INSERT INTO session_boots(session_id,user_id,booted_by,reason,booted_at)VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(session_id,user_id) DO UPDATE SET booted_at=NOW(),reason=EXCLUDED.reason,booted_by=EXCLUDED.booted_by`,[session_id,user_id,req.session.userId,reason.trim()]);
  await pool.query("INSERT INTO notifications(user_id,title,message,type)VALUES($1,'🚫 Removed from Session',$2,'absent')",[user_id,`Removed from session. Reason: ${reason.trim()}`]);
  auditLog(req.session.userId,'boot_user','attendance_logs',lc.rows[0]?.log_id||0,{session_id,user_id,reason},req.ip);
  res.json({success:true,message:'User booted.'});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/close_session',async(req,res)=>{try{const sid=parseInt(req.body.session_id);if(!sid)return res.status(400).json({success:false,message:'session_id required.'});await pool.query("UPDATE class_sessions SET status='closed',closed_at=NOW() WHERE session_id=$1",[sid]);auditLog(req.session.userId,'close_session','class_sessions',sid,{},req.ip);res.json({success:true,message:'Session closed.'});}catch(e){res.status(500).json({success:false,message:e.message});}});

// Instructor management
router.get('/list_instructors',async(req,res)=>{try{const like=`%${req.query.search||''}%`;const r=await pool.query(`SELECT i.*,u.user_id,u.student_id AS faculty_login_id,u.is_active AS account_active,(SELECT COUNT(*) FROM schedules s WHERE s.faculty_id=i.user_id AND s.is_active=TRUE) AS active_schedules FROM instructors i LEFT JOIN users u ON u.user_id=i.user_id WHERE(i.full_name ILIKE $1 OR i.instructor_code ILIKE $1 OR i.department ILIKE $1 OR i.email ILIKE $1) ORDER BY i.full_name`,[like]);const cnt=await pool.query("SELECT COUNT(*) FROM instructors WHERE is_active=TRUE");res.json({success:true,instructors:r.rows,total:parseInt(cnt.rows[0].count)});}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/create_instructor',async(req,res)=>{try{
  const b=req.body;if(!b.full_name||!b.department)return res.status(400).json({success:false,message:'full_name and department required.'});
  const lc=await pool.query("SELECT instructor_code FROM instructors ORDER BY instructor_id DESC LIMIT 1");
  const nn=lc.rows.length?(parseInt(lc.rows[0].instructor_code.slice(-4))+1):1;
  const code=`FAC-${new Date().getFullYear()}-${String(nn).padStart(4,'0')}`;
  const email=(b.email||'').trim()||null,rfid=(b.rfid_uid||'').trim()||null;
  if(email){const ec=await pool.query("SELECT 1 FROM instructors WHERE email=$1",[email]);if(ec.rows.length)return res.status(409).json({success:false,message:'Email in use.'});}
  if(rfid){const rc=await pool.query("SELECT 1 FROM instructors WHERE rfid_uid=$1",[rfid]);if(rc.rows.length)return res.status(409).json({success:false,message:'RFID in use.'});}
  const r=await pool.query(`INSERT INTO instructors(user_id,instructor_code,full_name,department,specialization,email,contact_no,rfid_uid,rfid_assigned_at,is_active)VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8 IS NOT NULL THEN NOW() ELSE NULL END,TRUE) RETURNING instructor_id`,
    [b.user_id?parseInt(b.user_id):null,code,b.full_name.trim(),b.department.trim(),(b.specialization||'').trim()||null,email,(b.contact_no||'').trim()||null,rfid]);
  auditLog(req.session.userId,'create_instructor','instructors',r.rows[0].instructor_id,{full_name:b.full_name},req.ip);
  res.json({success:true,message:'Created.',instructor_id:r.rows[0].instructor_id,instructor_code:code});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/update_instructor',async(req,res)=>{try{
  const b=req.body;const iid=parseInt(b.instructor_id);if(!iid)return res.status(400).json({success:false,message:'instructor_id required.'});
  const cu=await pool.query("SELECT * FROM instructors WHERE instructor_id=$1",[iid]);if(!cu.rows.length)return res.status(404).json({success:false,message:'Not found.'});const c=cu.rows[0];
  const email=b.email!==undefined?((b.email||'').trim()||null):c.email;
  if(email&&email!==c.email){const ec=await pool.query("SELECT 1 FROM instructors WHERE email=$1 AND instructor_id!=$2",[email,iid]);if(ec.rows.length)return res.status(409).json({success:false,message:'Email in use.'});}
  await pool.query(`UPDATE instructors SET full_name=$1,department=$2,specialization=$3,email=$4,contact_no=$5,user_id=$6 WHERE instructor_id=$7`,
    [b.full_name||c.full_name,b.department||c.department,b.specialization!==undefined?((b.specialization||'').trim()||null):c.specialization,email,b.contact_no!==undefined?((b.contact_no||'').trim()||null):c.contact_no,b.user_id!==undefined?(parseInt(b.user_id)||null):c.user_id,iid]);
  auditLog(req.session.userId,'update_instructor','instructors',iid,b,req.ip);res.json({success:true,message:'Updated.'});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/assign_instructor_rfid',async(req,res)=>{try{
  const{instructor_id,rfid_uid}=req.body;if(!instructor_id||!rfid_uid)return res.status(400).json({success:false,message:'instructor_id and rfid_uid required.'});
  const uid=rfid_uid.trim();const dup=await pool.query("SELECT instructor_id,full_name FROM instructors WHERE rfid_uid=$1 AND instructor_id!=$2",[uid,instructor_id]);
  if(dup.rows.length)return res.status(409).json({success:false,message:`Already assigned to ${dup.rows[0].full_name}.`});
  await pool.query("UPDATE instructors SET rfid_uid=$1,rfid_assigned_at=NOW() WHERE instructor_id=$2",[uid,instructor_id]);
  auditLog(req.session.userId,'assign_instructor_rfid','instructors',parseInt(instructor_id),{rfid_uid:uid},req.ip);
  res.json({success:true,message:'RFID assigned.'});
}catch(e){res.status(500).json({success:false,message:e.message});}});

router.post('/deactivate_instructor',async(req,res)=>{try{const iid=parseInt(req.body.instructor_id);if(!iid)return res.status(400).json({success:false,message:'instructor_id required.'});await pool.query("UPDATE instructors SET is_active=FALSE WHERE instructor_id=$1",[iid]);auditLog(req.session.userId,'deactivate_instructor','instructors',iid,{},req.ip);res.json({success:true,message:'Deactivated.'});}catch(e){res.status(500).json({success:false,message:e.message});}});

router.get('/instructor_detail',async(req,res)=>{try{
  const iid=parseInt(req.query.instructor_id);if(!iid)return res.status(400).json({success:false,message:'instructor_id required.'});
  const i=await pool.query(`SELECT i.*,u.student_id AS faculty_login_id,u.is_active AS account_active FROM instructors i LEFT JOIN users u ON u.user_id=i.user_id WHERE i.instructor_id=$1`,[iid]);
  if(!i.rows.length)return res.status(404).json({success:false,message:'Not found.'});
  const sc=await pool.query(`SELECT s.schedule_id,s.day_of_week,s.start_time::text,s.end_time::text,s.is_weekend_session,s.is_active,sub.subject_code,sub.subject_name,sec.section_name,rr.reader_code FROM schedules s JOIN subjects sub ON sub.subject_id=s.subject_id JOIN sections sec ON sec.section_id=s.section_id JOIN rfid_readers rr ON rr.reader_id=s.reader_id WHERE s.faculty_id=$1 AND s.is_active=TRUE ORDER BY CASE s.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END,s.start_time`,[i.rows[0].user_id||0]);
  res.json({success:true,instructor:i.rows[0],schedules:sc.rows});
}catch(e){res.status(500).json({success:false,message:e.message});}});

module.exports = router;
