// backend/models/liveAudioModel.js
import pool from '../db/db.js';

// ============================================================
//  TABLE CREATION
// ============================================================
export const createLiveAudioTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_sessions (
        id                SERIAL PRIMARY KEY,
        circle_id         INTEGER NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
        sheikh_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_name      VARCHAR(120) UNIQUE NOT NULL,
        status            VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        lesson_type       VARCHAR(30) NOT NULL DEFAULT 'memorize',
        audio_quality     SMALLINT NOT NULL DEFAULT 64,
        title             VARCHAR(200),
        summary           TEXT,
        recording_url     VARCHAR(500),
        peak_attendees    SMALLINT DEFAULT 0,
        actual_attendees  SMALLINT DEFAULT 0,
        scheduled_at      TIMESTAMP,
        started_at        TIMESTAMP,
        ended_at          TIMESTAMP,
        duration_sec      INTEGER DEFAULT 0,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ live_sessions table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_session_participants (
        id            SERIAL PRIMARY KEY,
        session_id    INTEGER NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at       TIMESTAMP,
        spoke_seconds INTEGER DEFAULT 0,
        raised_hand   BOOLEAN DEFAULT FALSE,
        was_muted     BOOLEAN DEFAULT FALSE,
        role          VARCHAR(20) DEFAULT 'audience',
        join_token    VARCHAR(64),
        UNIQUE(session_id, user_id)
      )
    `);
    console.log('✅ live_session_participants table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_session_notes (
        id          SERIAL PRIMARY KEY,
        session_id  INTEGER NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
        student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note        TEXT,
        rating      SMALLINT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, student_id),
        CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
      )
    `);
    console.log('✅ live_session_notes table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_session_events (
        id          SERIAL PRIMARY KEY,
        session_id  INTEGER NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
        user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type  VARCHAR(30) NOT NULL,
        metadata    JSONB,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ live_session_events table ready');

    // Indexes (idempotent)
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_live_sessions_circle_status ON live_sessions(circle_id, status)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_live_sessions_sheikh ON live_sessions(sheikh_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_live_sessions_started_at ON live_sessions(started_at DESC)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_live_participants_session ON live_session_participants(session_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_live_participants_user ON live_session_participants(user_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_live_notes_session_student ON live_session_notes(session_id, student_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_live_events_session_time ON live_session_events(session_id, created_at DESC)'
    );
  } catch (error) {
    console.error('❌ createLiveAudioTables error:', error.message);
    throw error;
  }
};

// ============================================================
//  MAPPING HELPERS
// ============================================================
const mapSessionRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    circleId: row.circle_id,
    sheikhId: row.sheikh_id,
    channelName: row.channel_name,
    status: row.status,
    lessonType: row.lesson_type,
    audioQuality: row.audio_quality,
    title: row.title,
    summary: row.summary,
    recordingUrl: row.recording_url,
    peakAttendees: row.peak_attendees,
    actualAttendees: row.actual_attendees,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSec: row.duration_sec,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sheikh: row.sheikh_name
      ? {
          id: row.sheikh_id,
          name: row.sheikh_name,
          avatar: row.sheikh_avatar,
        }
      : undefined,
    circle: row.circle_name
      ? { id: row.circle_id, name: row.circle_name }
      : undefined,
    participantCount: row.participant_count != null ? parseInt(row.participant_count, 10) : undefined,
  };
};

const mapParticipantRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    spokeSeconds: row.spoke_seconds || 0,
    raisedHand: row.raised_hand,
    wasMuted: row.was_muted,
    role: row.role,
    joinToken: row.join_token,
    user: row.user_name
      ? {
          id: row.user_id,
          name: row.user_name,
          avatar: row.user_avatar,
          accountType: row.user_account_type,
        }
      : undefined,
  };
};

const SESSION_SELECT = `
  s.*,
  u.name AS sheikh_name,
  u.avatar AS sheikh_avatar,
  c.name AS circle_name,
  (SELECT COUNT(*) FROM live_session_participants WHERE session_id = s.id AND left_at IS NULL) AS participant_count
`;

const PARTICIPANT_SELECT = `
  p.*,
  u.name AS user_name,
  u.avatar AS user_avatar,
  u.account_type AS user_account_type
`;

// ============================================================
//  SESSION CRUD
// ============================================================
export const createSession = async ({ circleId, sheikhId, lessonType, audioQuality, title, channelName, scheduledAt }) => {
  const result = await pool.query(
    `INSERT INTO live_sessions (circle_id, sheikh_id, channel_name, status, lesson_type, audio_quality, title, scheduled_at)
     VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7)
     RETURNING *`,
    [circleId, sheikhId, channelName, lessonType || 'memorize', audioQuality || 64, title || null, scheduledAt || null]
  );
  return result.rows[0];
};

export const findSessionById = async (sessionId) => {
  const result = await pool.query(
    `SELECT ${SESSION_SELECT}
     FROM live_sessions s
     JOIN users u ON s.sheikh_id = u.id
     LEFT JOIN circles c ON s.circle_id = c.id
     WHERE s.id = $1`,
    [sessionId]
  );
  return mapSessionRow(result.rows[0]);
};

export const findSessionByChannel = async (channelName) => {
  const result = await pool.query(
    `SELECT ${SESSION_SELECT}
     FROM live_sessions s
     JOIN users u ON s.sheikh_id = u.id
     LEFT JOIN circles c ON s.circle_id = c.id
     WHERE s.channel_name = $1`,
    [channelName]
  );
  return mapSessionRow(result.rows[0]);
};

export const listSessionsByCircle = async ({ circleId, status, limit = 20, offset = 0 } = {}) => {
  const params = [circleId];
  let where = 's.circle_id = $1';
  if (status) {
    params.push(status);
    where += ` AND s.status = $${params.length}`;
  }
  params.push(limit);
  params.push(offset);
  const result = await pool.query(
    `SELECT ${SESSION_SELECT}
     FROM live_sessions s
     JOIN users u ON s.sheikh_id = u.id
     LEFT JOIN circles c ON s.circle_id = c.id
     WHERE ${where}
     ORDER BY s.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows.map(mapSessionRow);
};

export const startSession = async (sessionId, sheikhId) => {
  const result = await pool.query(
    `UPDATE live_sessions
     SET status = 'live', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND sheikh_id = $2 AND status IN ('scheduled', 'paused')
     RETURNING *`,
    [sessionId, sheikhId]
  );
  return result.rows[0];
};

export const endSession = async (sessionId, sheikhId, { summary } = {}) => {
  const session = await findSessionById(sessionId);
  if (!session || session.sheikhId !== sheikhId) return null;

  const result = await pool.query(
    `UPDATE live_sessions
     SET status = 'ended',
         ended_at = CURRENT_TIMESTAMP,
         summary = COALESCE($2, summary),
         duration_sec = COALESCE(
           EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::int,
           0
         ),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND sheikh_id = $3
     RETURNING *`,
    [sessionId, summary || null, sheikhId]
  );

  // Mark all open participants as left.
  await pool.query(
    `UPDATE live_session_participants
     SET left_at = COALESCE(left_at, CURRENT_TIMESTAMP)
     WHERE session_id = $1 AND left_at IS NULL`,
    [sessionId]
  );

  return result.rows[0];
};

export const updateSessionRecording = async (sessionId, recordingUrl) => {
  const result = await pool.query(
    `UPDATE live_sessions SET recording_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
    [sessionId, recordingUrl]
  );
  return result.rows[0];
};

export const updateSessionSummary = async (sessionId, sheikhId, summary) => {
  const result = await pool.query(
    `UPDATE live_sessions
     SET summary = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND sheikh_id = $3
     RETURNING *`,
    [sessionId, summary, sheikhId]
  );
  return result.rows[0];
};

// ============================================================
//  PARTICIPANTS
// ============================================================
const randomToken = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

export const upsertParticipant = async ({ sessionId, userId, role = 'audience' }) => {
  const token = randomToken();
  const result = await pool.query(
    `INSERT INTO live_session_participants (session_id, user_id, role, join_token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, user_id)
     DO UPDATE SET
       left_at = NULL,
       role = EXCLUDED.role,
       join_token = EXCLUDED.join_token,
       joined_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [sessionId, userId, role, token]
  );
  return result.rows[0];
};

export const markParticipantLeft = async ({ sessionId, userId, spokeSeconds = 0 }) => {
  const result = await pool.query(
    `UPDATE live_session_participants
     SET left_at = CURRENT_TIMESTAMP,
         spoke_seconds = spoke_seconds + $3
     WHERE session_id = $1 AND user_id = $2
     RETURNING *`,
    [sessionId, userId, spokeSeconds]
  );
  return result.rows[0];
};

export const setParticipantRole = async ({ sessionId, userId, role }) => {
  const result = await pool.query(
    `UPDATE live_session_participants SET role = $3 WHERE session_id = $1 AND user_id = $2 RETURNING *`,
    [sessionId, userId, role]
  );
  return result.rows[0];
};

export const setParticipantMuted = async ({ sessionId, userId, muted }) => {
  const result = await pool.query(
    `UPDATE live_session_participants SET was_muted = $3 WHERE session_id = $1 AND user_id = $2 RETURNING *`,
    [sessionId, userId, !!muted]
  );
  return result.rows[0];
};

export const setParticipantRaisedHand = async ({ sessionId, userId, raised }) => {
  const result = await pool.query(
    `UPDATE live_session_participants SET raised_hand = $3 WHERE session_id = $1 AND user_id = $2 RETURNING *`,
    [sessionId, userId, !!raised]
  );
  return result.rows[0];
};

export const kickParticipant = async ({ sessionId, userId }) => {
  const result = await pool.query(
    `UPDATE live_session_participants
     SET left_at = CURRENT_TIMESTAMP
     WHERE session_id = $1 AND user_id = $2
     RETURNING *`,
    [sessionId, userId]
  );
  return result.rows[0];
};

export const listParticipants = async ({ sessionId, onlyActive = false }) => {
  const where = onlyActive
    ? 'p.session_id = $1 AND p.left_at IS NULL'
    : 'p.session_id = $1';
  const result = await pool.query(
    `SELECT ${PARTICIPANT_SELECT}
     FROM live_session_participants p
     JOIN users u ON p.user_id = u.id
     WHERE ${where}
     ORDER BY p.joined_at ASC`,
    [sessionId]
  );
  return result.rows.map(mapParticipantRow);
};

export const findParticipant = async ({ sessionId, userId }) => {
  const result = await pool.query(
    `SELECT ${PARTICIPANT_SELECT}
     FROM live_session_participants p
     JOIN users u ON p.user_id = u.id
     WHERE p.session_id = $1 AND p.user_id = $2`,
    [sessionId, userId]
  );
  return mapParticipantRow(result.rows[0]);
};

export const incrementPeakAttendees = async (sessionId) => {
  await pool.query(
    `UPDATE live_sessions
     SET peak_attendees = GREATEST(
       peak_attendees,
       (SELECT COUNT(*) FROM live_session_participants WHERE session_id = $1 AND left_at IS NULL)
     )
     WHERE id = $1`,
    [sessionId]
  );
};

export const setActualAttendees = async (sessionId) => {
  await pool.query(
    `UPDATE live_sessions
     SET actual_attendees = (
       SELECT COUNT(DISTINCT user_id) FROM live_session_participants WHERE session_id = $1
     )
     WHERE id = $1`,
    [sessionId]
  );
};

// ============================================================
//  NOTES
// ============================================================
export const upsertNote = async ({ sessionId, studentId, note, rating }) => {
  const result = await pool.query(
    `INSERT INTO live_session_notes (session_id, student_id, note, rating)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, student_id)
     DO UPDATE SET note = EXCLUDED.note, rating = EXCLUDED.rating, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [sessionId, studentId, note || null, rating || null]
  );
  return result.rows[0];
};

export const listNotesBySession = async (sessionId) => {
  const result = await pool.query(
    `SELECT n.*, u.name AS student_name, u.avatar AS student_avatar
     FROM live_session_notes n
     JOIN users u ON n.student_id = u.id
     WHERE n.session_id = $1
     ORDER BY n.updated_at DESC`,
    [sessionId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    note: row.note,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    student: { id: row.student_id, name: row.student_name, avatar: row.student_avatar },
  }));
};

// ============================================================
//  EVENTS LOG
// ============================================================
export const logEvent = async ({ sessionId, userId, eventType, metadata }) => {
  await pool.query(
    `INSERT INTO live_session_events (session_id, user_id, event_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, userId || null, eventType, metadata ? JSON.stringify(metadata) : null]
  );
};

export const listEvents = async ({ sessionId, limit = 100 } = {}) => {
  const result = await pool.query(
    `SELECT e.*, u.name AS user_name, u.avatar AS user_avatar
     FROM live_session_events e
     LEFT JOIN users u ON e.user_id = u.id
     WHERE e.session_id = $1
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    eventType: row.event_type,
    metadata: row.metadata,
    createdAt: row.created_at,
    user: row.user_name ? { id: row.user_id, name: row.user_name, avatar: row.user_avatar } : null,
  }));
};