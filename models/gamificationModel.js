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
import { getLevelForXP } from '../services/gamificationConfig.js';

const DEFAULT_VISIBILITY = {
  level: true,
  xp: true,
  progressPercentage: true,
  streak: true,
  achievements: true,
  featuredBadges: true,
  frame: true,
  background: true,
  nameEffect: true,
  profileTheme: true,
  avatar: true,
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
        equipped_profile_theme   VARCHAR(64),
        equipped_avatar_item     VARCHAR(64),
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
    await pool.query(`ALTER TABLE user_gamification ADD COLUMN IF NOT EXISTS equipped_profile_theme VARCHAR(64)`);
    await pool.query(`ALTER TABLE user_gamification ADD COLUMN IF NOT EXISTS equipped_avatar_item VARCHAR(64)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_gamification_level ON user_gamification (level DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_gamification_xp ON user_gamification (total_xp DESC)`);
    console.log('✅ user_gamification table ready');
  } catch (e) {
    console.error('❌ Error creating user_gamification table:', e.message);
  }
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
  const levelProgress = getLevelForXP(Number(row.total_xp) || 0);

  if (visibility.level !== false) {
    publicData.level = row.level;
  }
  if (visibility.xp !== false && visibility.progressPercentage !== false) {
    // Both xp & progress % on
    publicData.xp = {
      current: row.total_xp, // raw number
    };
    publicData.progressPercentage = Math.round(levelProgress.progress * 100);
  } else if (visibility.progressPercentage !== false) {
    publicData.progressPercentage = Math.round(levelProgress.progress * 100);
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
  }
  if (visibility.nameEffect !== false) {
    publicData.nameEffect = row.name_effect;
  }
  if (visibility.profileTheme !== false) {
    publicData.equippedProfileTheme = row.equipped_profile_theme;
  }
  if (visibility.avatar !== false) {
    publicData.equippedAvatarItem = row.equipped_avatar_item;
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
  getGamificationForViewer,
  getOwnGamification,
};