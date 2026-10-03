-- =====================================================
-- Elrawda Shop Catalog — Full Database Schema
-- =====================================================
-- Apply this on a fresh Neon project (or to upgrade an existing
-- database) to get the new server-authoritative shop_products table
-- and migrate the existing legacy products from the JS catalog into
-- the database.
--
-- How to apply:
--   1. Open Neon Dashboard → SQL Editor
--   2. Paste this entire file
--   3. Run it once
--
-- After applying the schema, run the Node migration to copy the
-- 1,283 legacy products and the 70 new premium products:
--
--   node scripts/migrate_shop_products.js
--   node scripts/seed_premium_products.js
--
-- The Node scripts are idempotent (UPSERT) so re-running them is
-- safe.
-- =====================================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. Schema version marker
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gamification_schema_version (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gamification_schema_version (id, version)
VALUES (1, 3)
ON CONFLICT (id) DO UPDATE SET version = 3, updated_at = CURRENT_TIMESTAMP;

-- ─────────────────────────────────────────────
-- 2. Shop products table (v3)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_products (
    id VARCHAR(96) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    category VARCHAR(32) NOT NULL CHECK (category IN (
        'FRAME', 'BACKGROUND', 'THEME', 'PROFILE_THEME', 'AVATAR', 'BADGE', 'SPECIAL'
    )),
    rarity VARCHAR(16) NOT NULL CHECK (rarity IN (
        'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'SPECIAL'
    )),
    price INTEGER NOT NULL CHECK (price >= 0),
    available BOOLEAN NOT NULL DEFAULT TRUE,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    limited BOOLEAN NOT NULL DEFAULT FALSE,
    is_new BOOLEAN NOT NULL DEFAULT FALSE,
    repeatable BOOLEAN NOT NULL DEFAULT FALSE,
    theme VARCHAR(64),
    collection_label VARCHAR(160),
    design_key VARCHAR(96) NOT NULL,
    asset_key VARCHAR(160),
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shop_products_category ON shop_products (category);
CREATE INDEX IF NOT EXISTS idx_shop_products_rarity ON shop_products (rarity);
CREATE INDEX IF NOT EXISTS idx_shop_products_theme ON shop_products (theme);
CREATE INDEX IF NOT EXISTS idx_shop_products_design_key ON shop_products (design_key);
CREATE INDEX IF NOT EXISTS idx_shop_products_featured ON shop_products (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_shop_products_limited ON shop_products (limited) WHERE limited = TRUE;

-- ─────────────────────────────────────────────
-- 3. Existing gamification tables (v2) — idempotent
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_gamification (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    total_xp BIGINT NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    equipped_frame VARCHAR(64),
    equipped_background VARCHAR(64),
    name_effect VARCHAR(64),
    equipped_badge VARCHAR(64),
    equipped_profile_theme VARCHAR(64),
    equipped_avatar_item VARCHAR(64),
    featured_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
    featured_achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
    achievement_count INTEGER NOT NULL DEFAULT 0,
    badge_count INTEGER NOT NULL DEFAULT 0,
    visibility JSONB NOT NULL DEFAULT '{
        "level": true, "xp": true, "progressPercentage": true, "streak": true,
        "achievements": true, "featuredBadges": true,
        "frame": true, "background": true, "nameEffect": true,
        "profileTheme": true, "avatar": true
    }'::jsonb,
    last_sync_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS gamification_user_badges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id VARCHAR(96) NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS gamification_inventory (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(96) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'purchase',
    purchase_id BIGINT,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_id),
    UNIQUE (user_id, purchase_id)
);

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

CREATE TABLE IF NOT EXISTS gamification_equipped (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot VARCHAR(32) NOT NULL CHECK (slot IN (
        'frame', 'background', 'nameEffect', 'profileTheme', 'badge', 'avatar', 'special'
    )),
    item_id VARCHAR(96),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS gamification_daily_rewards (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_date DATE NOT NULL,
    streak INTEGER NOT NULL CHECK (streak > 0),
    xp_amount INTEGER NOT NULL CHECK (xp_amount >= 0),
    coins_amount INTEGER NOT NULL CHECK (coins_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, reward_date)
);

CREATE TABLE IF NOT EXISTS gamification_radio_sessions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(96) NOT NULL,
    station_id VARCHAR(96) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS gamification_quran_audio_sessions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(96) NOT NULL,
    surah_number SMALLINT NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
    reciter_id VARCHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS gamification_quran_page_sessions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(96) NOT NULL,
    page_number SMALLINT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS gamification_counters (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    counter VARCHAR(96) NOT NULL,
    value BIGINT NOT NULL DEFAULT 0 CHECK (value >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, counter)
);

CREATE INDEX IF NOT EXISTS idx_gamification_transactions_user ON gamification_wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gamification_purchases_user ON gamification_purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gamification_missions_user ON gamification_missions (user_id, end_date);
CREATE INDEX IF NOT EXISTS idx_user_gamification_level ON user_gamification (level DESC);
CREATE INDEX IF NOT EXISTS idx_user_gamification_xp ON user_gamification (total_xp DESC);

COMMIT;

-- =====================================================
-- After running this SQL, execute in the backend directory:
--
--   cd H:\APPS\Elrawda\backend
--   node scripts/migrate_shop_products.js   # 1,283 legacy products
--   node scripts/seed_premium_products.js  # 70 new premium products
--
-- Then verify with:
--
--   node --input-type=module -e "import('./models/shopProductsModel.js').then(m => m.default.countByCategory().then(console.log))"
-- =====================================================

-- =====================================================
-- VERIFICATION QUERIES (run after applying migration + seed)
-- =====================================================
-- Total products:
--   SELECT COUNT(*) FROM shop_products;
--
-- Per category:
--   SELECT category, COUNT(*) FROM shop_products GROUP BY category ORDER BY category;
--
-- Premium products only (design_key starts with 'frame_premium' | 'bg_premium' | ...):
--   SELECT category, COUNT(*) FROM shop_products
--   WHERE id LIKE 'theme_premium_%'
--      OR id LIKE 'bg_premium_%'
--      OR id LIKE 'frame_premium_%'
--      OR id LIKE 'nameeffect_premium_%'
--      OR id LIKE 'badge_premium_%'
--      OR id LIKE 'avatar_premium_%'
--      OR id LIKE 'special_premium_%'
--   GROUP BY category ORDER BY category;
--
-- SPEC products priced at 15,000+ (matches test requirement):
--   SELECT id, name, category, rarity, price FROM shop_products WHERE rarity = 'SPECIAL';
-- =====================================================