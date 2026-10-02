// backend/models/gamificationModel.js
//
// Postgres model for the user_gamification table.
//
// IMPORTANT:
//   - This only stores PUBLIC gamification data + privacy flags.
//   - Coins, transactions, purchases, and inventory contents are
//     intentionally NEVER stored here (they stay on-device).
//   - All write paths must upsert (so first-write is also OK).
//   - All read paths for OTHER users must apply `visibility`.

import pool from '../db/db.js';

const DEFAULT_VISIBILITY = {
  level: true,
  xp: true,
  progressPercentage: true,
  streak: true,
  achievements: true,
  featuredBadges: true,
  frame: true,
  background: true,
};

const sanitizeString = (v, max = 64) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
};

const sanitizeIdArray = (v) => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === 'string' || typeof x === 'number')
    .map((x) => String(x))
    .slice(0, 12);
};

const sanitizeInteger = (v, fallback = 0, min = 0, max = 1_000_000) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
};

export const ensureGamificationTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS user_gamification (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        level           INTEGER     NOT NULL DEFAULT 1,
        total_xp        BIGINT      NOT NULL DEFAULT 0,
        current_streak  INTEGER     NOT NULL DEFAULT 0,
        best_streak     INTEGER     NOT NULL DEFAULT 0,
        equipped_frame           VARCHAR(64),
        equipped_background      VARCHAR(64),
        name_effect              VARCHAR(64),
        equipped_badge           VARCHAR(64),
        featured_badges          JSONB NOT NULL DEFAULT '[]'::jsonb,
        featured_achievements    JSONB NOT NULL DEFAULT '[]'::jsonb,
        achievement_count  INTEGER NOT NULL DEFAULT 0,
        badge_count        INTEGER NOT NULL DEFAULT 0,
        visibility JSONB NOT NULL DEFAULT ${
          // pass defaults as plain text in JS to avoid escaping headaches
          "'" + JSON.stringify(DEFAULT_VISIBILITY).replace(/'/g, "''") + "'"
        }::jsonb,
        last_sync_at  TIMESTAMP,
        updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  try {
    await pool.query(query);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_gamification_level ON user_gamification (level DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_gamification_xp ON user_gamification (total_xp DESC)`);
    console.log('✅ user_gamification table ready');
  } catch (e) {
    console.error('❌ Error creating user_gamification table:', e.message);
  }
};

export const upsertGamification = async (userId, payload) => {
  if (!userId || !payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  // Merge with defaults so partial syncs don't blank fields
  const safe = {
    level: sanitizeInteger(payload.level, 1, 1, 200),
    total_xp: sanitizeInteger(payload.total_xp, 0, 0, 100_000_000),
    current_streak: sanitizeInteger(payload.current_streak, 0, 0, 10_000),
    best_streak: sanitizeInteger(payload.best_streak, 0, 0, 10_000),
    equipped_frame: sanitizeString(payload.equipped_frame, 64),
    equipped_background: sanitizeString(payload.equipped_background, 64),
    name_effect: sanitizeString(payload.name_effect, 64),
    equipped_badge: sanitizeString(payload.equipped_badge, 64),
    featured_badges: JSON.stringify(sanitizeIdArray(payload.featured_badges)),
    featured_achievements: JSON.stringify(
      sanitizeIdArray(payload.featured_achievements),
    ),
    achievement_count: sanitizeInteger(payload.achievement_count, 0, 0, 1000),
    badge_count: sanitizeInteger(payload.badge_count, 0, 0, 1000),
    visibility: JSON.stringify({
      ...DEFAULT_VISIBILITY,
      ...(payload.visibility && typeof payload.visibility === 'object'
        ? payload.visibility
        : {}),
    }),
  };

  const query = `
    INSERT INTO user_gamification (
      user_id, level, total_xp, current_streak, best_streak,
      equipped_frame, equipped_background, name_effect, equipped_badge,
      featured_badges, featured_achievements,
      achievement_count, badge_count, visibility,
      last_sync_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10::jsonb, $11::jsonb,
      $12, $13, $14::jsonb,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id) DO UPDATE SET
      level            = EXCLUDED.level,
      total_xp         = EXCLUDED.total_xp,
      current_streak   = EXCLUDED.current_streak,
      best_streak      = EXCLUDED.best_streak,
      equipped_frame      = EXCLUDED.equipped_frame,
      equipped_background = EXCLUDED.equipped_background,
      name_effect         = EXCLUDED.name_effect,
      equipped_badge      = EXCLUDED.equipped_badge,
      featured_badges     = EXCLUDED.featured_badges,
      featured_achievements = EXCLUDED.featured_achievements,
      achievement_count   = EXCLUDED.achievement_count,
      badge_count         = EXCLUDED.badge_count,
      visibility          = EXCLUDED.visibility,
      last_sync_at        = CURRENT_TIMESTAMP,
      updated_at          = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const values = [
    userId,
    safe.level,
    safe.total_xp,
    safe.current_streak,
    safe.best_streak,
    safe.equipped_frame,
    safe.equipped_background,
    safe.name_effect,
    safe.equipped_badge,
    safe.featured_badges,
    safe.featured_achievements,
    safe.achievement_count,
    safe.badge_count,
    safe.visibility,
  ];

  const { rows: out } = await pool.query(query, values);
  return out[0] || null;
};

export const getGamificationForViewer = async (viewedUserId, viewerUserId) => {
  const result = await pool.query(
    `SELECT * FROM user_gamification WHERE user_id = $1`,
    [viewedUserId],
  );
  const row = result.rows[0];
  if (!row) {
    // No record yet — return a minimal default payload. We still respect
    // the privacy of "not configured yet" by not exposing anything.
    return null;
  }

  const visibility = row.visibility && typeof row.visibility === 'object'
    ? row.visibility
    : DEFAULT_VISIBILITY;

  // Build public payload based on visibility flags.
  const publicData = { userId: String(viewedUserId) };

  if (visibility.level !== false) {
    publicData.level = row.level;
  }
  if (visibility.xp !== false && visibility.progressPercentage !== false) {
    // Both xp & progress % on
    publicData.xp = {
      current: row.total_xp, // raw number
    };
    publicData.progressPercentage = row.level > 25 ? 100 : (row.total_xp % 1000) / 10;
  } else if (visibility.progressPercentage !== false) {
    publicData.progressPercentage = row.level > 25 ? 100 : (row.total_xp % 1000) / 10;
  }
  if (visibility.streak !== false) {
    publicData.streak = {
      current: row.current_streak,
      best: row.best_streak,
    };
  }
  if (visibility.featuredBadges !== false) {
    publicData.featuredBadges = Array.isArray(row.featured_badges)
      ? row.featured_badges
      : [];
  }
  if (visibility.achievements !== false) {
    publicData.featuredAchievements = Array.isArray(row.featured_achievements)
      ? row.featured_achievements
      : [];
    publicData.achievementCount = row.achievement_count;
    publicData.badgeCount = row.badge_count;
  }
  if (visibility.frame !== false) {
    publicData.equippedFrame = row.equipped_frame;
  }
  if (visibility.background !== false) {
    publicData.equippedBackground = row.equipped_background;
    publicData.nameEffect = row.name_effect;
  }

  // Always expose these are protected so a viewer can still navigate.
  publicData.isOwn = String(viewedUserId) === String(viewerUserId);

  return publicData;
};

export const getOwnGamification = async (userId) => {
  const result = await pool.query(
    `SELECT * FROM user_gamification WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
};

export default {
  ensureGamificationTable,
  upsertGamification,
  getGamificationForViewer,
  getOwnGamification,
};