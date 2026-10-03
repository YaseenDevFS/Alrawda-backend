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

  // Visibility flags always default to fully-public. A user who has not
  // configured anything yet still has their level, streak, achievements,
  // and equipped cosmetics shown to other viewers by default — but NEVER
  // coins, transactions, or inventory. The viewed user can opt out via
  // PUT /profile/preferences.
  const visibility = (row && row.visibility && typeof row.visibility === 'object')
    ? { ...DEFAULT_VISIBILITY, ...row.visibility }
    : DEFAULT_VISIBILITY;

  // Build public payload — always non-null so the client can render the
  // gamification section even when the viewed user has not configured
  // any features yet.
  const publicData = { userId: String(viewedUserId) };

  // If no row exists yet, expose only safe defaults (level 1, no streak,
  // no achievements, no equipped items) so the viewer UI does not
  // silently disappear. Coins / transactions / inventory are NEVER
  // returned here.
  const level = Number(row?.level) || 1;
  const totalXp = Number(row?.total_xp) || 0;
  const currentStreak = Number(row?.current_streak) || 0;
  const bestStreak = Number(row?.best_streak) || 0;
  const levelProgress = getLevelForXP(totalXp);

  if (visibility.level !== false) {
    publicData.level = level;
  }
  if (visibility.xp !== false && visibility.progressPercentage !== false) {
    publicData.xp = { current: totalXp };
    publicData.progressPercentage = Math.round(levelProgress.progress * 100);
  } else if (visibility.progressPercentage !== false) {
    publicData.progressPercentage = Math.round(levelProgress.progress * 100);
  }
  if (visibility.streak !== false) {
    publicData.streak = { current: currentStreak, best: bestStreak };
  }
  if (visibility.featuredBadges !== false) {
    publicData.featuredBadges = Array.isArray(row?.featured_badges)
      ? row.featured_badges
      : [];
  }
  if (visibility.achievements !== false) {
    publicData.featuredAchievements = Array.isArray(row?.featured_achievements)
      ? row.featured_achievements
      : [];
    publicData.achievementCount = Number(row?.achievement_count) || 0;
    publicData.badgeCount = Number(row?.badge_count) || 0;
  }
  if (visibility.frame !== false) {
    publicData.equippedFrame = row?.equipped_frame || null;
  }
  if (visibility.background !== false) {
    publicData.equippedBackground = row?.equipped_background || null;
  }
  if (visibility.nameEffect !== false) {
    publicData.nameEffect = row?.name_effect || null;
  }
  if (visibility.profileTheme !== false) {
    publicData.equippedProfileTheme = row?.equipped_profile_theme || null;
  }
  if (visibility.avatar !== false) {
    publicData.equippedAvatarItem = row?.equipped_avatar_item || null;
  }

  publicData.isOwn = String(viewedUserId) === String(viewerUserId);
  publicData.publicRecord = !!row;

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