// backend/models/circleModel.js
import pool from '../db/db.js';

// ============================================================
//  TABLE CREATION
// ============================================================

export const createCirclesTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS circles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        type VARCHAR(20) NOT NULL DEFAULT 'both',
        range_type VARCHAR(20) NOT NULL DEFAULT 'surah',
        start_surah SMALLINT,
        start_ayah SMALLINT,
        end_surah SMALLINT,
        end_ayah SMALLINT,
        start_juz SMALLINT,
        end_juz SMALLINT,
        start_page SMALLINT,
        end_page SMALLINT,
        start_date DATE NOT NULL,
        end_date DATE,
        is_open_ended BOOLEAN DEFAULT false,
        days_of_week TEXT[] DEFAULT '{}',
        start_time TIME NOT NULL,
        duration_minutes SMALLINT DEFAULT 60,
        timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
        daily_amount_type VARCHAR(20),
        daily_amount_value SMALLINT,
        daily_revision BOOLEAN DEFAULT true,
        weekly_revision_enabled BOOLEAN DEFAULT false,
        weekly_revision_day VARCHAR(10),
        weekly_revision_amount SMALLINT,
        monthly_revision_enabled BOOLEAN DEFAULT false,
        monthly_revision_amount SMALLINT,
        tests_weekly BOOLEAN DEFAULT false,
        tests_monthly BOOLEAN DEFAULT false,
        tests_per_juz BOOLEAN DEFAULT false,
        grading_system VARCHAR(20) DEFAULT 'rating',
        max_students SMALLINT DEFAULT 20,
        join_type VARCHAR(20) NOT NULL DEFAULT 'approval',
        visibility VARCHAR(20) DEFAULT 'public',
        gender_policy VARCHAR(20) DEFAULT 'all',
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Circles table created or already exists');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS circle_members (
        id SERIAL PRIMARY KEY,
        circle_id INTEGER NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        UNIQUE(circle_id, student_id)
      )
    `);
    console.log('✅ Circle members table created or already exists');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS circle_progress (
        id SERIAL PRIMARY KEY,
        circle_id INTEGER NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        memorized_ayahs INTEGER DEFAULT 0,
        memorized_pages INTEGER DEFAULT 0,
        revised_ayahs INTEGER DEFAULT 0,
        last_session_date DATE,
        weekly_test_score SMALLINT,
        monthly_test_score SMALLINT,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(circle_id, student_id)
      )
    `);
    console.log('✅ Circle progress table created or already exists');

    // Helpful indexes for the hot read paths (list, filter, member lookup)
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_circles_teacher ON circles(teacher_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_circles_status ON circles(status)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON circle_members(circle_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_circle_members_student ON circle_members(student_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_circle_progress_circle ON circle_progress(circle_id)'
    );
  } catch (error) {
    console.error('❌ createCirclesTables error:', error.message);
    throw error;
  }
};

// ============================================================
//  HELPERS — shape of rows returned by SELECTs
// ============================================================

// Maps DB row → API-friendly camelCase. Keeps controllers thin.
const mapCircleRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    rangeType: row.range_type,
    startSurah: row.start_surah,
    startAyah: row.start_ayah,
    endSurah: row.end_surah,
    endAyah: row.end_ayah,
    startJuz: row.start_juz,
    endJuz: row.end_juz,
    startPage: row.start_page,
    endPage: row.end_page,
    startDate: row.start_date,
    endDate: row.end_date,
    isOpenEnded: row.is_open_ended,
    daysOfWeek: row.days_of_week || [],
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    timezone: row.timezone,
    dailyAmountType: row.daily_amount_type,
    dailyAmountValue: row.daily_amount_value,
    dailyRevision: row.daily_revision,
    weeklyRevisionEnabled: row.weekly_revision_enabled,
    weeklyRevisionDay: row.weekly_revision_day,
    weeklyRevisionAmount: row.weekly_revision_amount,
    monthlyRevisionEnabled: row.monthly_revision_enabled,
    monthlyRevisionAmount: row.monthly_revision_amount,
    testsWeekly: row.tests_weekly,
    testsMonthly: row.tests_monthly,
    testsPerJuz: row.tests_per_juz,
    gradingSystem: row.grading_system,
    maxStudents: row.max_students,
    joinType: row.join_type,
    visibility: row.visibility,
    genderPolicy: row.gender_policy,
    teacherId: row.teacher_id,
    teacher: row.teacher_name
      ? {
          id: row.teacher_id,
          name: row.teacher_name,
          email: row.teacher_email,
          avatar: row.teacher_avatar,
          role: row.teacher_role,
          accountType: row.teacher_account_type,
        }
      : undefined,
    membersCount: row.members_count != null ? parseInt(row.members_count, 10) : undefined,
    pendingCount: row.pending_count != null ? parseInt(row.pending_count, 10) : undefined,
    isMember: row.is_member === true || row.is_member === 'true',
    isPending: row.is_pending === true || row.is_pending === 'true',
    memberStatus: row.member_status || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const CIRCLE_SELECT = `
  c.*,
  u.name AS teacher_name,
  u.email AS teacher_email,
  u.avatar AS teacher_avatar,
  u.role AS teacher_role,
  u.account_type AS teacher_account_type
`;

// ============================================================
//  CRUD
// ============================================================

export const createCircle = async (teacherId, data) => {
  const query = `
    INSERT INTO circles (
      name, description, type, range_type,
      start_surah, start_ayah, end_surah, end_ayah,
      start_juz, end_juz, start_page, end_page,
      start_date, end_date, is_open_ended,
      days_of_week, start_time, duration_minutes, timezone,
      daily_amount_type, daily_amount_value,
      daily_revision, weekly_revision_enabled, weekly_revision_day, weekly_revision_amount,
      monthly_revision_enabled, monthly_revision_amount,
      tests_weekly, tests_monthly, tests_per_juz, grading_system,
      max_students, join_type, visibility, gender_policy,
      teacher_id
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15,
      $16, $17, $18, $19,
      $20, $21,
      $22, $23, $24, $25,
      $26, $27,
      $28, $29, $30, $31,
      $32, $33, $34, $35,
      $36
    )
    RETURNING *
  `;
  const values = [
    data.name,
    data.description || null,
    data.type || 'both',
    data.rangeType || 'surah',
    data.startSurah || null,
    data.startAyah || null,
    data.endSurah || null,
    data.endAyah || null,
    data.startJuz || null,
    data.endJuz || null,
    data.startPage || null,
    data.endPage || null,
    data.startDate,
    data.endDate || null,
    !!data.isOpenEnded,
    data.daysOfWeek || [],
    data.startTime,
    data.durationMinutes || 60,
    data.timezone || 'Asia/Riyadh',
    data.dailyAmountType || null,
    data.dailyAmountValue || null,
    data.dailyRevision !== false,
    !!data.weeklyRevisionEnabled,
    data.weeklyRevisionDay || null,
    data.weeklyRevisionAmount || null,
    !!data.monthlyRevisionEnabled,
    data.monthlyRevisionAmount || null,
    !!data.testsWeekly,
    !!data.testsMonthly,
    !!data.testsPerJuz,
    data.gradingSystem || 'rating',
    data.maxStudents || 20,
    data.joinType || 'approval',
    data.visibility || 'public',
    data.genderPolicy || 'all',
    teacherId,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

export const findCircleById = async (id, requesterId = null) => {
  const query = `
    SELECT ${CIRCLE_SELECT},
      (SELECT COUNT(*) FROM circle_members WHERE circle_id = c.id AND status = 'approved') AS members_count,
      (SELECT COUNT(*) FROM circle_members WHERE circle_id = c.id AND status = 'pending') AS pending_count,
      CASE WHEN $2::int IS NULL THEN NULL ELSE
          (SELECT status FROM circle_members WHERE circle_id = c.id AND student_id = $2 LIMIT 1)
        END AS member_status,
      CASE WHEN $2::int IS NULL THEN FALSE ELSE
          EXISTS (
            SELECT 1 FROM circle_members
            WHERE circle_id = c.id AND student_id = $2 AND status = 'approved'
          )
        END AS is_member,
      CASE WHEN $2::int IS NULL THEN FALSE ELSE
          EXISTS (
            SELECT 1 FROM circle_members
            WHERE circle_id = c.id AND student_id = $2 AND status = 'pending'
          )
        END AS is_pending
    FROM circles c
    JOIN users u ON c.teacher_id = u.id
    WHERE c.id = $1
  `;
  const result = await pool.query(query, [id, requesterId]);
  return mapCircleRow(result.rows[0]);
};

export const listCircles = async ({
  requesterId = null,
  visibility = null, // 'public' | 'private' | null (both)
  status = 'active',
  gender = null,
  teacherId = null, // when set, only circles owned by this teacher
  mine = false, // when true, circles where user is approved member OR teacher
  search = null,
  limit = 20,
  offset = 0,
} = {}) => {
  const params = [];
  const where = [];

  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (visibility) {
    params.push(visibility);
    where.push(`c.visibility = $${params.length}`);
  }
  if (gender && gender !== 'all') {
    params.push(gender);
    where.push(`c.gender_policy = $${params.length}`);
  }
  if (teacherId) {
    params.push(teacherId);
    where.push(`c.teacher_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(c.name ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  if (mine) {
    params.push(requesterId);
    where.push(
      `(c.teacher_id = $${params.length} OR EXISTS (SELECT 1 FROM circle_members WHERE circle_id = c.id AND student_id = $${params.length}))`
    );
  }

  params.push(requesterId); // for member_status subquery
  const requesterParamIdx = params.length;

  params.push(limit);
  params.push(offset);

  const query = `
    SELECT ${CIRCLE_SELECT},
      (SELECT COUNT(*) FROM circle_members WHERE circle_id = c.id AND status = 'approved') AS members_count,
      CASE WHEN $${requesterParamIdx}::int IS NULL THEN NULL ELSE
          (SELECT status FROM circle_members WHERE circle_id = c.id AND student_id = $${requesterParamIdx} LIMIT 1)
        END AS member_status,
      CASE WHEN $${requesterParamIdx}::int IS NULL THEN FALSE ELSE
          EXISTS (
            SELECT 1 FROM circle_members
            WHERE circle_id = c.id AND student_id = $${requesterParamIdx} AND status = 'approved'
          )
        END AS is_member,
      CASE WHEN $${requesterParamIdx}::int IS NULL THEN FALSE ELSE
          EXISTS (
            SELECT 1 FROM circle_members
            WHERE circle_id = c.id AND student_id = $${requesterParamIdx} AND status = 'pending'
          )
        END AS is_pending
    FROM circles c
    JOIN users u ON c.teacher_id = u.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(query, params);
  return result.rows.map(mapCircleRow);
};

export const updateCircle = async (id, teacherId, data) => {
  const allowed = [
    'name', 'description', 'type', 'range_type',
    'start_surah', 'start_ayah', 'end_surah', 'end_ayah',
    'start_juz', 'end_juz', 'start_page', 'end_page',
    'start_date', 'end_date', 'is_open_ended',
    'days_of_week', 'start_time', 'duration_minutes', 'timezone',
    'daily_amount_type', 'daily_amount_value',
    'daily_revision', 'weekly_revision_enabled', 'weekly_revision_day', 'weekly_revision_amount',
    'monthly_revision_enabled', 'monthly_revision_amount',
    'tests_weekly', 'tests_monthly', 'tests_per_juz', 'grading_system',
    'max_students', 'join_type', 'visibility', 'gender_policy', 'status',
  ];

  const camelToSnake = {
    rangeType: 'range_type',
    startSurah: 'start_surah',
    startAyah: 'start_ayah',
    endSurah: 'end_surah',
    endAyah: 'end_ayah',
    startJuz: 'start_juz',
    endJuz: 'end_juz',
    startPage: 'start_page',
    endPage: 'end_page',
    startDate: 'start_date',
    endDate: 'end_date',
    isOpenEnded: 'is_open_ended',
    daysOfWeek: 'days_of_week',
    startTime: 'start_time',
    durationMinutes: 'duration_minutes',
    dailyAmountType: 'daily_amount_type',
    dailyAmountValue: 'daily_amount_value',
    dailyRevision: 'daily_revision',
    weeklyRevisionEnabled: 'weekly_revision_enabled',
    weeklyRevisionDay: 'weekly_revision_day',
    weeklyRevisionAmount: 'weekly_revision_amount',
    monthlyRevisionEnabled: 'monthly_revision_enabled',
    monthlyRevisionAmount: 'monthly_revision_amount',
    testsWeekly: 'tests_weekly',
    testsMonthly: 'tests_monthly',
    testsPerJuz: 'tests_per_juz',
    gradingSystem: 'grading_system',
    maxStudents: 'max_students',
    joinType: 'join_type',
    genderPolicy: 'gender_policy',
  };

  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, val] of Object.entries(data)) {
    const column = camelToSnake[key] || key;
    if (!allowed.includes(column)) continue;
    if (val === undefined) continue;
    fields.push(`${column} = $${i++}`);
    values.push(val);
  }
  if (fields.length === 0) return null;

  values.push(id);
  values.push(teacherId);
  const query = `
    UPDATE circles
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${i++} AND teacher_id = $${i++}
    RETURNING *
  `;
  const result = await pool.query(query, values);
  return result.rows[0];
};

export const deleteCircle = async (id, teacherId) => {
  const result = await pool.query(
    'DELETE FROM circles WHERE id = $1 AND teacher_id = $2 RETURNING id',
    [id, teacherId]
  );
  return result.rows[0];
};

// ============================================================
//  MEMBERS
// ============================================================

export const joinCircle = async (circleId, studentId, defaultStatus = 'pending') => {
  const result = await pool.query(
    `INSERT INTO circle_members (circle_id, student_id, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (circle_id, student_id)
     DO UPDATE SET status = EXCLUDED.status, joined_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [circleId, studentId, defaultStatus]
  );
  return result.rows[0];
};

export const approveMember = async (circleId, studentId, teacherId) => {
  // Verify the caller owns this circle (defense-in-depth even if middleware checks).
  const owner = await pool.query(
    'SELECT teacher_id FROM circles WHERE id = $1',
    [circleId]
  );
  if (!owner.rows[0] || owner.rows[0].teacher_id !== teacherId) {
    return null;
  }
  const result = await pool.query(
    `UPDATE circle_members
     SET status = 'approved', approved_at = CURRENT_TIMESTAMP
     WHERE circle_id = $1 AND student_id = $2 AND status = 'pending'
     RETURNING *`,
    [circleId, studentId]
  );
  return result.rows[0];
};

export const rejectMember = async (circleId, studentId, teacherId) => {
  const owner = await pool.query(
    'SELECT teacher_id FROM circles WHERE id = $1',
    [circleId]
  );
  if (!owner.rows[0] || owner.rows[0].teacher_id !== teacherId) return null;
  const result = await pool.query(
    `UPDATE circle_members
     SET status = 'rejected'
     WHERE circle_id = $1 AND student_id = $2
     RETURNING *`,
    [circleId, studentId]
  );
  return result.rows[0];
};

export const removeMember = async (circleId, studentId, requesterId, isTeacher) => {
  if (isTeacher) {
    const owner = await pool.query(
      'SELECT teacher_id FROM circles WHERE id = $1',
      [circleId]
    );
    if (!owner.rows[0] || owner.rows[0].teacher_id !== requesterId) return null;
    const result = await pool.query(
      `DELETE FROM circle_members WHERE circle_id = $1 AND student_id = $2 RETURNING *`,
      [circleId, studentId]
    );
    return result.rows[0];
  }
  // Self-leave
  const result = await pool.query(
    `DELETE FROM circle_members
     WHERE circle_id = $1 AND student_id = $2 AND student_id <> (SELECT teacher_id FROM circles WHERE id = $1)
     RETURNING *`,
    [circleId, studentId]
  );
  return result.rows[0];
};

export const listMembers = async (circleId, { status = null, limit = 50, offset = 0 } = {}) => {
  const params = [circleId];
  let where = 'cm.circle_id = $1';
  if (status) {
    params.push(status);
    where += ` AND cm.status = $${params.length}`;
  }
  params.push(limit);
  params.push(offset);

  const query = `
    SELECT
      cm.id, cm.circle_id, cm.student_id, cm.status, cm.joined_at, cm.approved_at,
      u.name, u.email, u.avatar, u.role, u.account_type,
      cp.memorized_ayahs, cp.memorized_pages, cp.revised_ayahs,
      cp.last_session_date, cp.weekly_test_score, cp.monthly_test_score, cp.notes,
      cp.updated_at AS progress_updated_at
    FROM circle_members cm
    JOIN users u ON cm.student_id = u.id
    LEFT JOIN circle_progress cp ON cp.circle_id = cm.circle_id AND cp.student_id = cm.student_id
    WHERE ${where}
    ORDER BY
      CASE WHEN cm.status = 'pending' THEN 0 ELSE 1 END,
      cm.joined_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    id: row.id,
    circleId: row.circle_id,
    studentId: row.student_id,
    status: row.status,
    joinedAt: row.joined_at,
    approvedAt: row.approved_at,
    user: {
      id: row.student_id,
      name: row.name,
      email: row.email,
      avatar: row.avatar,
      role: row.role,
      accountType: row.account_type,
    },
    progress: {
      memorizedAyahs: row.memorized_ayahs || 0,
      memorizedPages: row.memorized_pages || 0,
      revisedAyahs: row.revised_ayahs || 0,
      lastSessionDate: row.last_session_date,
      weeklyTestScore: row.weekly_test_score,
      monthlyTestScore: row.monthly_test_score,
      notes: row.notes,
      updatedAt: row.progress_updated_at,
    },
  }));
};

// ============================================================
//  PROGRESS
// ============================================================

export const upsertProgress = async (circleId, studentId, teacherId, data) => {
  // Only the circle's teacher may modify student progress.
  const owner = await pool.query(
    'SELECT teacher_id FROM circles WHERE id = $1',
    [circleId]
  );
  if (!owner.rows[0] || owner.rows[0].teacher_id !== teacherId) return null;

  // Make sure the student is actually an approved member.
  const member = await pool.query(
    `SELECT 1 FROM circle_members
     WHERE circle_id = $1 AND student_id = $2 AND status = 'approved'`,
    [circleId, studentId]
  );
  if (!member.rows[0]) return 'NOT_MEMBER';

  // Ensure a row exists so the UPDATE always targets something.
  await pool.query(
    `INSERT INTO circle_progress (circle_id, student_id)
     VALUES ($1, $2)
     ON CONFLICT (circle_id, student_id) DO NOTHING`,
    [circleId, studentId]
  );

  const allowed = {
    memorized_ayahs: data.memorizedAyahs,
    memorized_pages: data.memorizedPages,
    revised_ayahs: data.revisedAyahs,
    last_session_date: data.lastSessionDate,
    weekly_test_score: data.weeklyTestScore,
    monthly_test_score: data.monthlyTestScore,
    notes: data.notes,
  };

  const fields = [];
  const values = [];
  let i = 1;
  for (const [col, val] of Object.entries(allowed)) {
    if (val === undefined) continue;
    fields.push(`${col} = $${i++}`);
    values.push(val);
  }

  if (fields.length === 0) {
    const result = await pool.query(
      'SELECT * FROM circle_progress WHERE circle_id = $1 AND student_id = $2',
      [circleId, studentId]
    );
    return result.rows[0];
  }

  values.push(circleId);
  values.push(studentId);
  const query = `
    UPDATE circle_progress
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE circle_id = $${i++} AND student_id = $${i++}
    RETURNING *
  `;
  const result = await pool.query(query, values);
  return result.rows[0];
};

export const getProgressByStudent = async (circleId, studentId) => {
  const result = await pool.query(
    `SELECT cp.*, u.name AS student_name, u.avatar AS student_avatar
     FROM circle_progress cp
     JOIN users u ON cp.student_id = u.id
     WHERE cp.circle_id = $1 AND cp.student_id = $2`,
    [circleId, studentId]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    circleId: row.circle_id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentAvatar: row.student_avatar,
    memorizedAyahs: row.memorized_ayahs,
    memorizedPages: row.memorized_pages,
    revisedAyahs: row.revised_ayahs,
    lastSessionDate: row.last_session_date,
    weeklyTestScore: row.weekly_test_score,
    monthlyTestScore: row.monthly_test_score,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
};

export const getCircleAggregateStats = async (circleId) => {
  // Aggregate over all approved members (no progress row → counted as zero).
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE cm.status = 'approved') AS approved_count,
       COUNT(*) FILTER (WHERE cm.status = 'pending') AS pending_count,
       COALESCE(AVG(COALESCE(cp.memorized_ayahs, 0)), 0)::int AS avg_memorized_ayahs,
       COALESCE(AVG(COALESCE(cp.revised_ayahs, 0)), 0)::int AS avg_revised_ayahs
     FROM circle_members cm
     LEFT JOIN circle_progress cp
       ON cp.circle_id = cm.circle_id AND cp.student_id = cm.student_id
     WHERE cm.circle_id = $1`,
    [circleId]
  );
  const row = result.rows[0];
  return {
    approvedCount: parseInt(row.approved_count, 10),
    pendingCount: parseInt(row.pending_count, 10),
    avgMemorizedAyahs: parseInt(row.avg_memorized_ayahs, 10),
    avgRevisedAyahs: parseInt(row.avg_revised_ayahs, 10),
  };
};