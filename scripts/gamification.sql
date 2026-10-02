-- backend/scripts/gamification.sql
-- =====================================================
-- Gamification tables — public data + privacy flags
-- =====================================================
--
-- DESIGN NOTES
-- ------------
-- One row per user. NEVER contains coins, purchases,
-- transaction history, or inventory contents (those stay
-- local on-device to preserve the spirit of the spec).
--
-- `visibility` is a JSONB of booleans owned by the user.
-- When other users fetch a profile, the API checks this
-- JSON before deciding what to return.
--
-- `featured_badges` / `featured_achievements` are arrays
-- of ids the user picked to surface on their profile.

CREATE TABLE IF NOT EXISTS user_gamification (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- core progression
    level           INTEGER     NOT NULL DEFAULT 1,
    total_xp        BIGINT      NOT NULL DEFAULT 0,
    current_streak  INTEGER     NOT NULL DEFAULT 0,
    best_streak     INTEGER     NOT NULL DEFAULT 0,

    -- equipped cosmetics
    equipped_frame           VARCHAR(64),
    equipped_background      VARCHAR(64),
    name_effect              VARCHAR(64),
    equipped_badge           VARCHAR(64),

    -- featured (id arrays)
    featured_badges          JSONB NOT NULL DEFAULT '[]'::jsonb,
    featured_achievements    JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- counters (so other users see "X / 50 achievements")
    achievement_count  INTEGER NOT NULL DEFAULT 0,
    badge_count        INTEGER NOT NULL DEFAULT 0,

    -- privacy flags (always-true flags not stored here:
    --   coins / transactions / inventory / purchases are NEVER public)
    visibility JSONB NOT NULL DEFAULT '{
        "level":               true,
        "xp":                  true,
        "progressPercentage":  true,
        "streak":              true,
        "achievements":        true,
        "featuredBadges":      true,
        "frame":               true,
        "background":          true
    }'::jsonb,

    -- bookkeeping
    last_sync_at  TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_gamification_level
    ON user_gamification (level DESC);

CREATE INDEX IF NOT EXISTS idx_user_gamification_xp
    ON user_gamification (total_xp DESC);