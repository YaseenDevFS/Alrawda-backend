-- ============================================================
--  Live Audio Sessions for Memorization Circles — Database Schema
--  Project: Alrawda
--  DB: PostgreSQL (Neon)
--
--  HOW TO RUN
--  ==========
--  Option A — Auto:
--    The backend will run these CREATE TABLE statements on boot
--    via `createLiveAudioTables()` in `backend/models/liveAudioModel.js`.
--
--    cd backend
--    npm run dev
--
--  Option B — Manual:
--    1. Neon Dashboard → SQL Editor → paste and Run, OR
--    2. psql "<your DATABASE_URL>" -f backend/scripts/live_sessions.sql
--
--  SAFE TO RE-RUN: every statement uses IF NOT EXISTS so this is
--  idempotent.
-- ============================================================

-- ============================================================
--  1. LIVE_SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS live_sessions (
    id              SERIAL PRIMARY KEY,
    circle_id       INTEGER NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    sheikh_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Agora channel — globally unique so two circles never collide
    channel_name    VARCHAR(120) UNIQUE NOT NULL,

    -- Lifecycle: scheduled | live | paused | ended | cancelled
    status          VARCHAR(20) NOT NULL DEFAULT 'scheduled',

    -- Content metadata
    lesson_type     VARCHAR(30) NOT NULL DEFAULT 'memorize',
                                                       -- memorize | review | recitation
    audio_quality   SMALLINT NOT NULL DEFAULT 64,      -- kbps
    title           VARCHAR(200),
    summary         TEXT,

    -- Recording (optional)
    recording_url   VARCHAR(500),

    -- Participants count cache
    peak_attendees  SMALLINT DEFAULT 0,
    actual_attendees SMALLINT DEFAULT 0,

    -- Timestamps
    scheduled_at    TIMESTAMP,
    started_at      TIMESTAMP,
    ended_at        TIMESTAMP,
    duration_sec    INTEGER DEFAULT 0,

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  2. LIVE_SESSION_PARTICIPANTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS live_session_participants (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at         TIMESTAMP,

    -- Engagement metrics
    spoke_seconds   INTEGER DEFAULT 0,
    raised_hand     BOOLEAN DEFAULT FALSE,
    was_muted       BOOLEAN DEFAULT FALSE,

    -- Role at join: sheikh | audience | speaker
    role            VARCHAR(20) DEFAULT 'audience',

    -- Reconnect token (random per-session, used to detect retries)
    join_token      VARCHAR(64),

    UNIQUE(session_id, user_id)
);

-- ============================================================
--  3. LIVE_SESSION_NOTES TABLE (sheikh-only, per-student)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_session_notes (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    note            TEXT,
    rating          SMALLINT,                          -- 1..5

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(session_id, student_id),
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

-- ============================================================
--  4. LIVE_SESSION_EVENTS TABLE (audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_session_events (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Event type: joined | left | mic_on | mic_off | raised_hand |
    --             accepted | rejected | muted | kicked | ended
    event_type      VARCHAR(30) NOT NULL,

    metadata        JSONB,

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  5. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_live_sessions_circle_status
    ON live_sessions(circle_id, status);

CREATE INDEX IF NOT EXISTS idx_live_sessions_sheikh
    ON live_sessions(sheikh_id);

CREATE INDEX IF NOT EXISTS idx_live_sessions_started_at
    ON live_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_participants_session
    ON live_session_participants(session_id);

CREATE INDEX IF NOT EXISTS idx_live_participants_user
    ON live_session_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_live_participants_raised
    ON live_session_participants(session_id, raised_hand)
    WHERE raised_hand = TRUE;

CREATE INDEX IF NOT EXISTS idx_live_notes_session_student
    ON live_session_notes(session_id, student_id);

CREATE INDEX IF NOT EXISTS idx_live_events_session_time
    ON live_session_events(session_id, created_at DESC);

-- ============================================================
--  6. VERIFICATION QUERIES (optional)
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public'
--    AND table_name LIKE 'live_%'
--  ORDER BY table_name;

-- ============================================================
--  END
-- ============================================================