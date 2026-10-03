-- =====================================================
-- Elrawda Gamification v2 — Neon-ready schema
-- =====================================================
-- Apply this once on a fresh Neon project (or to upgrade
-- from v1). If you already ran the older v1 schema, the
-- DO $$ section at the bottom will wipe gamification data
-- before bumping the version marker.
--
-- If your database is empty (only the `users` table
-- exists), this is safe to run as-is.
--
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS so it's safe to re-run.
-- =====================================================

-- -----------------------------------------------------
-- 1. Public profile view (visible to other users)
-- -----------------------------------------------------
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
    equipped_profile_theme   VARCHAR(64),
    equipped_avatar_item     VARCHAR(64),

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
        "background":          true,
        "nameEffect":          true,
        "profileTheme":        true,
        "avatar":              true
    }'::jsonb,

    -- bookkeeping
    last_sync_at  TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_gamification_level
    ON user_gamification (level DESC);

CREATE INDEX IF NOT EXISTS idx_user_gamification_xp
    ON user_gamification (total_xp DESC);

ALTER TABLE user_gamification
    ADD COLUMN IF NOT EXISTS equipped_profile_theme VARCHAR(64);
ALTER TABLE user_gamification
    ADD COLUMN IF NOT EXISTS equipped_avatar_item VARCHAR(64);

-- -----------------------------------------------------
-- 2. Schema version marker (single row, id=1)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_schema_version (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 3. Authoritative wallet (server is the source of truth)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_wallet (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
    coins BIGINT NOT NULL DEFAULT 0 CHECK (coins >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
    longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
    last_activity_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 4. Activity log (PRIMARY KEY = duplicate protection)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_activities (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id VARCHAR(180) NOT NULL,
    type VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    xp_delta BIGINT NOT NULL DEFAULT 0,
    coins_delta BIGINT NOT NULL DEFAULT 0,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, activity_id)
);

-- -----------------------------------------------------
-- 5. Wallet transactions (idempotency = no double rewards)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(180) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'COIN' CHECK (currency IN ('COIN', 'XP')),
    type VARCHAR(32) NOT NULL CHECK (type IN (
        'reward', 'purchase', 'adjustment', 'daily_reward',
        'mission_reward', 'achievement_reward'
    )),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    source VARCHAR(64) NOT NULL,
    source_id VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, idempotency_key)
);

ALTER TABLE gamification_wallet_transactions
    ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'COIN';

-- -----------------------------------------------------
-- 6. Missions (one row per user per mission per period)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_missions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id VARCHAR(96) NOT NULL,
    period_key VARCHAR(24) NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
    target INTEGER NOT NULL CHECK (target > 0),
    reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
    reward_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    rewarded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, mission_id, period_key)
);

-- -----------------------------------------------------
-- 7. Achievements
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_achievements (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(96) NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
    target INTEGER NOT NULL CHECK (target > 0),
    unlocked BOOLEAN NOT NULL DEFAULT FALSE,
    unlocked_at TIMESTAMPTZ,
    rewarded_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, achievement_id)
);

-- -----------------------------------------------------
-- 8. Badges (simpler — just unlocked timestamps)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_user_badges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id VARCHAR(96) NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, badge_id)
);

-- -----------------------------------------------------
-- 9. Inventory (one row per owned item — UNIQUE item_id)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_inventory (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(96) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'purchase',
    purchase_id BIGINT,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_id),
    UNIQUE (user_id, purchase_id)
);

-- -----------------------------------------------------
-- 10. Purchases (idempotency + UNIQUE item_id = no double-buy)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_purchases (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(96) NOT NULL,
    price BIGINT NOT NULL CHECK (price >= 0),
    idempotency_key VARCHAR(180) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, idempotency_key),
    UNIQUE (user_id, item_id)
);

-- -----------------------------------------------------
-- 11. Equipped (one row per slot — slot CHECK)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_equipped (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot VARCHAR(32) NOT NULL CHECK (slot IN (
        'frame', 'background', 'nameEffect', 'profileTheme', 'badge', 'avatar', 'special'
    )),
    item_id VARCHAR(96),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, slot)
);

-- -----------------------------------------------------
-- 12. Daily rewards (UNIQUE date = no double-claim/day)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_daily_rewards (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_date DATE NOT NULL,
    streak INTEGER NOT NULL CHECK (streak > 0),
    xp_amount INTEGER NOT NULL CHECK (xp_amount >= 0),
    coins_amount INTEGER NOT NULL CHECK (coins_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, reward_date)
);

-- -----------------------------------------------------
-- 13. Radio sessions (server-side tracking)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_radio_sessions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(96) NOT NULL,
    station_id VARCHAR(96) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, session_id)
);

-- -----------------------------------------------------
-- 14. Quran audio sessions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_quran_audio_sessions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(96) NOT NULL,
    surah_number SMALLINT NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
    reciter_id VARCHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, session_id)
);

-- -----------------------------------------------------
-- 15. Quran page sessions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_quran_page_sessions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(96) NOT NULL,
    page_number SMALLINT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, session_id)
);

-- -----------------------------------------------------
-- 16. Counters (stats per user — pages read, surahs, ...)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamification_counters (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    counter VARCHAR(96) NOT NULL,
    value BIGINT NOT NULL DEFAULT 0 CHECK (value >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, counter)
);

-- -----------------------------------------------------
-- 17. Helpful indexes
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gamification_transactions_user
    ON gamification_wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gamification_purchases_user
    ON gamification_purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gamification_missions_user
    ON gamification_missions (user_id, end_date);

-- -----------------------------------------------------
-- 18. Seed version marker at v1, then migrate to v2
--     (only wipes data if upgrading from v1; v2 is a no-op)
-- -----------------------------------------------------
INSERT INTO gamification_schema_version (id, version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE current_version INTEGER;
BEGIN
    SELECT version INTO current_version
    FROM gamification_schema_version WHERE id = 1 FOR UPDATE;

    IF current_version < 2 THEN
        DELETE FROM gamification_activities;
        DELETE FROM gamification_wallet_transactions;
        DELETE FROM gamification_daily_rewards;
        DELETE FROM gamification_equipped;
        DELETE FROM gamification_inventory;
        DELETE FROM gamification_purchases;
        DELETE FROM gamification_missions;
        DELETE FROM gamification_achievements;
        DELETE FROM gamification_user_badges;
        DELETE FROM gamification_radio_sessions;
        DELETE FROM gamification_quran_audio_sessions;
        DELETE FROM gamification_quran_page_sessions;
        DELETE FROM gamification_counters;
        DELETE FROM gamification_wallet;
        DELETE FROM user_gamification;

        UPDATE gamification_schema_version
        SET version = 2, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1;
    END IF;
END $$;

-- =====================================================
-- DONE. Tables created:
--   user_gamification, gamification_schema_version,
--   gamification_wallet, gamification_activities,
--   gamification_wallet_transactions, gamification_missions,
--   gamification_achievements, gamification_user_badges,
--   gamification_inventory, gamification_purchases,
--   gamification_equipped, gamification_daily_rewards,
--   gamification_radio_sessions,
--   gamification_quran_audio_sessions,
--   gamification_quran_page_sessions,
--   gamification_counters
-- =====================================================