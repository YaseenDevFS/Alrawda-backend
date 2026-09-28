-- ============================================================
--  Memorization Circles (المقرأة) — Database Schema
--  Project: Alrawda
--  DB: PostgreSQL (Neon)
--
--  HOW TO RUN
--  ==========
--  Option A — Auto (recommended):
--    Just start the backend. The function `createCirclesTables()` in
--    `backend/models/circleModel.js` will run these CREATE TABLE
--    statements on boot via the existing `initializeDatabase()` flow.
--
--    cd backend
--    npm run dev
--
--  Option B — Manual (if you want to apply it without booting the server):
--    1. psql:
--         psql "<your DATABASE_URL>" -f backend/scripts/circles.sql
--    2. Neon Dashboard:
--         Open https://console.neon.tech → your project → SQL Editor
--         Paste the file contents and click "Run".
--    3. pgAdmin / DBeaver:
--         Connect to your DB, open Query Tool, paste, execute.
--
--  SAFE TO RE-RUN: every statement uses IF NOT EXISTS / OR REPLACE
--  semantics so re-running this file is idempotent.
-- ============================================================

-- ============================================================
--  1. ADD account_type COLUMN TO users TABLE
--     (Separate from the existing "role" text field.)
--     Values: 'student' (default) | 'sheikh'
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'student';

-- Backfill any existing users so the column has a non-null value.
UPDATE users
    SET account_type = 'student'
WHERE account_type IS NULL;

-- ============================================================
--  2. CIRCLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS circles (
    id                      SERIAL PRIMARY KEY,
    name                    VARCHAR(100) NOT NULL,
    description             TEXT,
    type                    VARCHAR(20) NOT NULL DEFAULT 'both',     -- memorize | review | both
    range_type              VARCHAR(20) NOT NULL DEFAULT 'surah',    -- surah | ayah | juz | page

    -- Range
    start_surah             SMALLINT,
    start_ayah              SMALLINT,
    end_surah               SMALLINT,
    end_ayah                SMALLINT,
    start_juz               SMALLINT,
    end_juz                 SMALLINT,
    start_page              SMALLINT,
    end_page                SMALLINT,

    -- Schedule
    start_date              DATE NOT NULL,
    end_date                DATE,
    is_open_ended           BOOLEAN DEFAULT FALSE,
    days_of_week            TEXT[] DEFAULT '{}',
    start_time              TIME NOT NULL,
    duration_minutes        SMALLINT DEFAULT 60,
    timezone                VARCHAR(50) DEFAULT 'Asia/Riyadh',

    -- Memorization & revision plan
    daily_amount_type       VARCHAR(20),                            -- ayahs | pages | wajh | percent
    daily_amount_value      SMALLINT,
    daily_revision          BOOLEAN DEFAULT TRUE,
    weekly_revision_enabled BOOLEAN DEFAULT FALSE,
    weekly_revision_day     VARCHAR(10),
    weekly_revision_amount  SMALLINT,
    monthly_revision_enabled BOOLEAN DEFAULT FALSE,
    monthly_revision_amount SMALLINT,

    -- Tests
    tests_weekly            BOOLEAN DEFAULT FALSE,
    tests_monthly           BOOLEAN DEFAULT FALSE,
    tests_per_juz           BOOLEAN DEFAULT FALSE,
    grading_system          VARCHAR(20) DEFAULT 'rating',           -- rating | percent

    -- Join settings
    max_students            SMALLINT DEFAULT 20,
    join_type               VARCHAR(20) NOT NULL DEFAULT 'approval',-- approval | open | invite
    visibility              VARCHAR(20) DEFAULT 'public',           -- public | private
    gender_policy           VARCHAR(20) DEFAULT 'all',              -- all | male | female

    -- Ownership & lifecycle
    teacher_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status                  VARCHAR(20) DEFAULT 'active',           -- active | completed | archived
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  3. CIRCLE_MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS circle_members (
    id              SERIAL PRIMARY KEY,
    circle_id       INTEGER NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20) DEFAULT 'pending',                 -- pending | approved | rejected | left
    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at     TIMESTAMP,
    UNIQUE(circle_id, student_id)
);

-- ============================================================
--  4. CIRCLE_PROGRESS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS circle_progress (
    id                  SERIAL PRIMARY KEY,
    circle_id           INTEGER NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    student_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memorized_ayahs     INTEGER DEFAULT 0,
    memorized_pages     INTEGER DEFAULT 0,
    revised_ayahs       INTEGER DEFAULT 0,
    last_session_date   DATE,
    weekly_test_score   SMALLINT,
    monthly_test_score  SMALLINT,
    notes               TEXT,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(circle_id, student_id)
);

-- ============================================================
--  5. INDEXES (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_circles_teacher           ON circles(teacher_id);
CREATE INDEX IF NOT EXISTS idx_circles_status            ON circles(status);
CREATE INDEX IF NOT EXISTS idx_circles_visibility        ON circles(visibility);
CREATE INDEX IF NOT EXISTS idx_circles_created_at        ON circles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_circle_members_circle     ON circle_members(circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_student    ON circle_members(student_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_status     ON circle_members(status);

CREATE INDEX IF NOT EXISTS idx_circle_progress_circle    ON circle_progress(circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_progress_student   ON circle_progress(student_id);

-- ============================================================
--  6. SAMPLE VERIFICATION QUERIES (optional — run to confirm)
-- ============================================================
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'users' AND column_name = 'account_type';
--
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public'
--    AND table_name IN ('circles', 'circle_members', 'circle_progress')
--  ORDER BY table_name;

-- ============================================================
--  END
-- ============================================================