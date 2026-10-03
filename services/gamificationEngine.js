import pool from '../db/db.js';
import shopProductsModel from '../models/shopProductsModel.js';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACTIVITY_REWARDS,
  DAILY_REWARD,
  getLevelForXP,
  getPeriod,
  MISSION_DEFINITIONS,
} from './gamificationConfig.js';

// All 11 visibility flags default to public (true). Coins, transactions,
// inventory, and purchases are intentionally NOT in this list — they
// are private wallet data and must never be exposed to other users.
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

const BADGE_DEFINITIONS = [
  { id: 'quran_explorer', counter: 'quranPagesRead', target: 10, coins: 30 },
  { id: 'quran_companion', counter: 'quranPagesRead', target: 100, coins: 75 },
  { id: 'quran_keeper', counter: 'quranPagesRead', target: 604, coins: 500 },
  { id: 'streak_7', counter: 'streak', target: 7, coins: 30 },
  { id: 'streak_30', counter: 'streak', target: 30, coins: 100 },
  { id: 'streak_100', counter: 'streak', target: 100, coins: 300 },
  { id: 'knowledge_seeker', counter: 'hadithsRead', target: 100, coins: 75 },
  { id: 'azkar_master', counter: 'azkarCategoriesCompleted', target: 5, coins: 150 },
];

const utcDate = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
const asNumber = (value) => Number(value || 0);
const safeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const json = JSON.stringify(metadata);
  if (json.length > 4096) throw Object.assign(new Error('Activity metadata is too large'), { status: 400 });
  return metadata;
};

const withTransaction = async (operation) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const ensureWallet = async (client, userId) => {
  await client.query(
    `INSERT INTO gamification_wallet (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  await client.query(
    `INSERT INTO gamification_inventory (user_id, item_id, source)
     VALUES ($1, 'frame_default', 'default'), ($1, 'bg_default', 'default'), ($1, 'theme_default', 'default')
     ON CONFLICT (user_id, item_id) DO NOTHING`,
    [userId],
  );
  const result = await client.query(
    `SELECT * FROM gamification_wallet WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  return result.rows[0];
};

const updateWallet = async (client, userId, wallet) => {
  const level = getLevelForXP(asNumber(wallet.xp)).level;
  wallet.level = level;
  await client.query(
    `UPDATE gamification_wallet SET xp = $2, coins = $3, level = $4,
       current_streak = $5, longest_streak = $6, last_activity_date = $7,
       updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [userId, wallet.xp, wallet.coins, level, wallet.current_streak, wallet.longest_streak, wallet.last_activity_date],
  );
};

const getCounter = async (client, userId, counter) => {
  const result = await client.query(
    `SELECT value FROM gamification_counters WHERE user_id = $1 AND counter = $2`,
    [userId, counter],
  );
  return asNumber(result.rows[0]?.value);
};

const incrementCounter = async (client, userId, counter, amount = 1) => {
  const result = await client.query(
    `INSERT INTO gamification_counters (user_id, counter, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, counter) DO UPDATE
       SET value = gamification_counters.value + EXCLUDED.value,
           updated_at = CURRENT_TIMESTAMP
     RETURNING value`,
    [userId, counter, amount],
  );
  return asNumber(result.rows[0]?.value);
};

const updateStreak = (wallet, today) => {
  const last = wallet.last_activity_date ? utcDate(wallet.last_activity_date) : null;
  if (last === today) return false;
  const yesterday = new Date(`${today}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  wallet.current_streak = last === utcDate(yesterday)
    ? asNumber(wallet.current_streak) + 1
    : 1;
  wallet.longest_streak = Math.max(asNumber(wallet.longest_streak), wallet.current_streak);
  wallet.last_activity_date = today;
  return true;
};

const addLedgerEntry = async (client, userId, wallet, {
  key,
  type,
  currency,
  amount,
  source,
  sourceId,
  direction = 'CREDIT',
}) => {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return 0;
  const balanceKey = currency === 'XP' ? 'xp' : 'coins';
  const signedValue = direction === 'DEBIT' ? -value : value;
  const nextBalance = asNumber(wallet[balanceKey]) + signedValue;
  if (nextBalance < 0) throw Object.assign(new Error('Insufficient balance'), { status: 409, code: 'INSUFFICIENT_BALANCE' });
  const insert = await client.query(
    `INSERT INTO gamification_wallet_transactions
       (user_id, idempotency_key, type, currency, amount, balance_after, source, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [userId, key, type, currency, value, nextBalance, source, sourceId || null],
  );
  if (!insert.rows.length) return 0;
  wallet[balanceKey] = nextBalance;
  return value;
};

const readMissionMetric = async (client, userId, mission, now) => {
  const today = utcDate(now);
  const week = getPeriod('WEEKLY', now).key;
  switch (mission.type) {
    case 'quranPagesToday': return getCounter(client, userId, `quranPagesToday:${today}`);
    case 'morningAzkarToday': return getCounter(client, userId, `morningAzkar:${today}`);
    case 'eveningAzkarToday': return getCounter(client, userId, `eveningAzkar:${today}`);
    case 'quranPagesThisWeek': return getCounter(client, userId, `quranPagesWeek:${week}`);
    case 'azkarThisWeek': return getCounter(client, userId, `azkarWeek:${week}`);
    case 'communityThisWeek': return getCounter(client, userId, `communityWeek:${week}`);
    case 'circlesThisWeek': return getCounter(client, userId, `circlesWeek:${week}`);
    case 'quranDaysThisWeek': {
      const result = await client.query(
        `SELECT COUNT(*) AS count FROM gamification_counters
         WHERE user_id = $1 AND counter LIKE $2 AND value > 0`,
        [userId, `quranReadDay:${week}:%`],
      );
      return asNumber(result.rows[0]?.count);
    }
    default: return 0;
  }
};

const evaluateMissions = async (client, userId, wallet, now) => {
  const completed = [];
  const rewarded = [];
  for (const definition of MISSION_DEFINITIONS) {
    const period = getPeriod(definition.frequency, now);
    const progress = await readMissionMetric(client, userId, definition, now);
    const start = period.start;
    const end = period.end;
    const updated = await client.query(
      `INSERT INTO gamification_missions
         (user_id, mission_id, period_key, progress, target, reward_xp, reward_coins, start_date, end_date, completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE
         SET progress = GREATEST(gamification_missions.progress, EXCLUDED.progress),
             updated_at = CURRENT_TIMESTAMP
       RETURNING progress, completed, rewarded_at`,
      [userId, definition.id, period.key, progress, definition.target, definition.rewardXP, definition.rewardCoins, start, end],
    );
    const row = updated.rows[0];
    if (asNumber(row.progress) < definition.target || row.completed) continue;
    await client.query(
      `UPDATE gamification_missions SET completed = TRUE, rewarded_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND mission_id = $2 AND period_key = $3 AND completed = FALSE`,
      [userId, definition.id, period.key],
    );
    const xp = await addLedgerEntry(client, userId, wallet, {
      key: `mission:${definition.id}:${period.key}:xp`,
      type: 'mission_reward', currency: 'XP', amount: definition.rewardXP,
      source: 'mission', sourceId: definition.id,
    });
    const coins = await addLedgerEntry(client, userId, wallet, {
      key: `mission:${definition.id}:${period.key}:coins`,
      type: 'mission_reward', currency: 'COIN', amount: definition.rewardCoins,
      source: 'mission', sourceId: definition.id,
    });
    completed.push({ ...definition, progress: asNumber(row.progress), periodKey: period.key });
    rewarded.push({ source: definition.id, xp, coins });
  }
  return { completed, rewarded };
};

const readAchievementMetric = async (client, userId, definition, wallet) => {
  if (definition.type === 'streak') return asNumber(wallet.current_streak);
  return getCounter(client, userId, definition.type);
};

const evaluateAchievements = async (client, userId, wallet) => {
  const unlocked = [];
  const rewarded = [];
  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    const progress = await readAchievementMetric(client, userId, definition, wallet);
    const updated = await client.query(
      `INSERT INTO gamification_achievements (user_id, achievement_id, progress, target)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, achievement_id) DO UPDATE
         SET progress = GREATEST(gamification_achievements.progress, EXCLUDED.progress)
       RETURNING unlocked`,
      [userId, definition.id, progress, definition.target],
    );
    if (updated.rows[0]?.unlocked || progress < definition.target) continue;
    await client.query(
      `UPDATE gamification_achievements SET unlocked = TRUE, unlocked_at = CURRENT_TIMESTAMP,
         rewarded_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND achievement_id = $2 AND unlocked = FALSE`,
      [userId, definition.id],
    );
    const xp = await addLedgerEntry(client, userId, wallet, {
      key: `achievement:${definition.id}:xp`, type: 'achievement_reward', currency: 'XP',
      amount: definition.rewardXP, source: 'achievement', sourceId: definition.id,
    });
    const coins = await addLedgerEntry(client, userId, wallet, {
      key: `achievement:${definition.id}:coins`, type: 'achievement_reward', currency: 'COIN',
      amount: definition.rewardCoins, source: 'achievement', sourceId: definition.id,
    });
    unlocked.push(definition);
    rewarded.push({ source: definition.id, xp, coins });
  }
  return { unlocked, rewarded };
};

const evaluateBadges = async (client, userId, wallet) => {
  const unlocked = [];
  for (const definition of BADGE_DEFINITIONS) {
    const progress = definition.counter === 'streak'
      ? asNumber(wallet.current_streak)
      : await getCounter(client, userId, definition.counter);
    if (progress < definition.target) continue;
    const result = await client.query(
      `INSERT INTO gamification_user_badges (user_id, badge_id)
       VALUES ($1, $2) ON CONFLICT (user_id, badge_id) DO NOTHING RETURNING badge_id`,
      [userId, definition.id],
    );
    if (!result.rows.length) continue;
    await addLedgerEntry(client, userId, wallet, {
      key: `badge:${definition.id}:coins`, type: 'achievement_reward', currency: 'COIN',
      amount: definition.coins, source: 'achievement', sourceId: definition.id,
    });
    unlocked.push({ id: definition.id });
  }
  return unlocked;
};

const syncPublicSnapshot = async (client, userId, wallet) => {
  const [achievements, badges, preferences, equippedResult] = await Promise.all([
    client.query(`SELECT COUNT(*) AS count FROM gamification_achievements WHERE user_id = $1 AND unlocked = TRUE`, [userId]),
    client.query(`SELECT COUNT(*) AS count FROM gamification_user_badges WHERE user_id = $1`, [userId]),
    client.query(`SELECT featured_badges, featured_achievements, visibility FROM user_gamification WHERE user_id = $1`, [userId]),
    client.query(`SELECT slot, item_id FROM gamification_equipped WHERE user_id = $1`, [userId]),
  ]);
  const prior = preferences.rows[0] || {};
  const equipped = Object.fromEntries(equippedResult.rows.map((row) => [row.slot, row.item_id]));

  // Always keep all 11 visibility flags on the row. New rows start with
  // the full DEFAULT_VISIBILITY (everything public except private wallet
  // data). Existing rows keep the user's preferences. We merge so a user
  // who toggled one flag off doesn't accidentally lose the others if the
  // stored JSON happens to be sparse.
  const storedVisibility = (prior.visibility && typeof prior.visibility === 'object')
    ? prior.visibility
    : {};
  const mergedVisibility = { ...DEFAULT_VISIBILITY, ...storedVisibility };

  await client.query(
    `INSERT INTO user_gamification (
       user_id, level, total_xp, current_streak, best_streak,
       equipped_frame, equipped_background, name_effect, equipped_badge,
       equipped_profile_theme, equipped_avatar_item,
       featured_badges, featured_achievements, achievement_count, badge_count, visibility,
       last_sync_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       level = EXCLUDED.level, total_xp = EXCLUDED.total_xp,
       current_streak = EXCLUDED.current_streak, best_streak = EXCLUDED.best_streak,
       equipped_frame = EXCLUDED.equipped_frame, equipped_background = EXCLUDED.equipped_background,
       name_effect = EXCLUDED.name_effect, equipped_badge = EXCLUDED.equipped_badge,
       equipped_profile_theme = EXCLUDED.equipped_profile_theme, equipped_avatar_item = EXCLUDED.equipped_avatar_item,
       achievement_count = EXCLUDED.achievement_count, badge_count = EXCLUDED.badge_count,
       visibility = EXCLUDED.visibility,
       last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    [
      userId, wallet.level, wallet.xp, wallet.current_streak, wallet.longest_streak,
      equipped.frame || null, equipped.background || null, equipped.nameEffect || null,
      equipped.badge || null, equipped.profileTheme || null, equipped.avatar || null,
      JSON.stringify(prior.featured_badges || []), JSON.stringify(prior.featured_achievements || []),
      asNumber(achievements.rows[0]?.count), asNumber(badges.rows[0]?.count),
      JSON.stringify(mergedVisibility),
    ],
  );
};

const snapshotInTransaction = async (client, userId, wallet) => {
  const [counterRows, missionRows, achievementRows, badgeRows, inventoryRows, equippedRows, dailyRows, transactionRows, preferenceRows] = await Promise.all([
    client.query(`SELECT counter, value FROM gamification_counters WHERE user_id = $1`, [userId]),
    client.query(`SELECT * FROM gamification_missions WHERE user_id = $1 AND end_date >= CURRENT_DATE ORDER BY end_date, mission_id`, [userId]),
    client.query(`SELECT * FROM gamification_achievements WHERE user_id = $1 ORDER BY achievement_id`, [userId]),
    client.query(`SELECT badge_id FROM gamification_user_badges WHERE user_id = $1 ORDER BY unlocked_at DESC`, [userId]),
    client.query(`SELECT item_id FROM gamification_inventory WHERE user_id = $1 ORDER BY acquired_at DESC`, [userId]),
    client.query(`SELECT slot, item_id FROM gamification_equipped WHERE user_id = $1`, [userId]),
    client.query(`SELECT reward_date FROM gamification_daily_rewards WHERE user_id = $1 AND reward_date = CURRENT_DATE`, [userId]),
    client.query(`SELECT id, type, currency, amount, balance_after AS "balanceAfter", source, source_id AS "sourceId", created_at AS "createdAt" FROM gamification_wallet_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 50`, [userId]),
    client.query(`SELECT featured_badges, featured_achievements, visibility FROM user_gamification WHERE user_id = $1`, [userId]),
  ]);
  const counters = Object.fromEntries(counterRows.rows.map((row) => [row.counter, asNumber(row.value)]));
  const missions = MISSION_DEFINITIONS.map((definition) => {
    const period = getPeriod(definition.frequency);
    const state = missionRows.rows.find((row) => row.mission_id === definition.id && row.period_key === period.key);
    return {
      ...definition,
      targetType: definition.type,
      targetCount: definition.target,
      xpReward: definition.rewardXP,
      coinsReward: definition.rewardCoins,
      progress: asNumber(state?.progress),
      completed: !!state?.completed,
      claimed: !!state?.rewarded_at,
    };
  });
  const achievements = ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const state = achievementRows.rows.find((row) => row.achievement_id === definition.id);
    return { ...definition, progress: asNumber(state?.progress), unlocked: !!state?.unlocked, unlockedAt: state?.unlocked_at || null };
  });
  const level = getLevelForXP(asNumber(wallet.xp));
  const equippedItems = Object.fromEntries(equippedRows.rows.map((row) => [row.slot, row.item_id]));
  return {
    schemaVersion: 2,
    xp: asNumber(wallet.xp),
    totalXP: asNumber(wallet.xp),
    level,
    coins: asNumber(wallet.coins),
    streak: { current: asNumber(wallet.current_streak), best: asNumber(wallet.longest_streak) },
    longestStreak: asNumber(wallet.longest_streak),
    counters,
    achievements,
    badges: badgeRows.rows.map((row) => row.badge_id),
    missions,
    inventory: { ownedIds: inventoryRows.rows.map((row) => row.item_id) },
    equippedItems,
    featuredBadges: preferenceRows.rows[0]?.featured_badges || [],
    featuredAchievements: preferenceRows.rows[0]?.featured_achievements || [],
    visibility: preferenceRows.rows[0]?.visibility || {},
    dailyReward: { claimedToday: dailyRows.rows.length > 0 },
    transactions: transactionRows.rows,
  };
};

const validateAndCanonicalizeEvent = async (client, userId, event, now) => {
  const metadata = safeMetadata(event.metadata);
  const date = utcDate(now);
  const type = String(event.type || '');
  if (type === 'prayer_times_opened') {
    return { type, metadata, activityId: `prayer-times:${date}`, reward: { xp: 0, coins: 0, streak: false, counter: null } };
  }
  const reward = ACTIVITY_REWARDS[type];
  if (!reward) throw Object.assign(new Error('Unsupported activity type'), { status: 422, code: 'UNSUPPORTED_ACTIVITY' });

  if (type === 'quran_page_completed') {
    const page = Number(metadata.pageNumber);
    if (!Number.isInteger(page) || page < 1 || page > 604) throw Object.assign(new Error('Invalid Quran page'), { status: 400 });
    const sessionId = String(metadata.sessionId || '');
    const session = await client.query(
      `SELECT page_number, started_at, completed_at FROM gamification_quran_page_sessions
       WHERE user_id = $1 AND session_id = $2 FOR UPDATE`,
      [userId, sessionId],
    );
    if (!session.rows.length || session.rows[0].completed_at || Number(session.rows[0].page_number) !== page) {
      throw Object.assign(new Error('Quran page session is invalid or already completed'), { status: 409 });
    }
    if (now.getTime() - new Date(session.rows[0].started_at).getTime() < 15_000) {
      throw Object.assign(new Error('Quran page completion threshold not reached'), { status: 409 });
    }
    return { type, metadata: { pageNumber: page, sessionId }, activityId: `quran-page:${page}:${date}`, reward };
  }
  if (type === 'quran_audio_completed') {
    const sessionId = String(metadata.sessionId || '');
    const session = await client.query(
      `SELECT surah_number, reciter_id, started_at, completed_at
       FROM gamification_quran_audio_sessions
       WHERE user_id = $1 AND session_id = $2 FOR UPDATE`,
      [userId, sessionId],
    );
    if (!session.rows.length || session.rows[0].completed_at) {
      throw Object.assign(new Error('Quran audio session is invalid or already completed'), { status: 409 });
    }
    const elapsed = now.getTime() - new Date(session.rows[0].started_at).getTime();
    if (elapsed < 5_000) throw Object.assign(new Error('Quran audio completion threshold not reached'), { status: 409 });
    return {
      type,
      metadata: { sessionId, surahNumber: session.rows[0].surah_number, reciterId: session.rows[0].reciter_id },
      activityId: `quran-audio:${session.rows[0].surah_number}:${date}`,
      reward,
    };
  }
  if (type === 'azkar_completed' || type === 'azkar_item_completed') {
    const category = Number(metadata.categoryId);
    const itemIndex = Number(metadata.itemIndex);
    if (!Number.isInteger(category) || category < 1 || category > 4) throw Object.assign(new Error('Invalid Azkar category'), { status: 400 });
    if (type === 'azkar_item_completed' && (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex > 1000)) throw Object.assign(new Error('Invalid Azkar item'), { status: 400 });
    const categoryName = String(metadata.categoryName || '').toLowerCase();
    const name = category === 1 || categoryName.includes('morning')
      ? 'morning'
      : category === 2 || categoryName.includes('evening') ? 'evening' : 'general';
    const activityId = type === 'azkar_completed'
      ? `azkar:${category}:${date}`
      : `azkar-item:${category}:${itemIndex}:${date}`;
    return { type, metadata: { categoryId: category, categoryName: name, itemIndex }, activityId, reward };
  }
  if (type === 'community_post_created') {
    const postId = Number(metadata.postId);
    const ownership = await client.query('SELECT 1 FROM posts WHERE id = $1 AND user_id = $2', [postId, userId]);
    if (!ownership.rows.length) throw Object.assign(new Error('Post does not belong to this user'), { status: 403 });
    return { type, metadata: { postId }, activityId: `community-post:${postId}`, reward };
  }
  if (type === 'community_comment_created') {
    const commentId = Number(metadata.commentId);
    const ownership = await client.query('SELECT 1 FROM comments WHERE id = $1 AND user_id = $2', [commentId, userId]);
    if (!ownership.rows.length) throw Object.assign(new Error('Comment does not belong to this user'), { status: 403 });
    return { type, metadata: { commentId }, activityId: `community-comment:${commentId}`, reward };
  }
  if (type === 'circle_session_completed') {
    const sessionId = Number(metadata.sessionId);
    const verification = await client.query(
      `SELECT s.id, s.circle_id, s.duration_sec
       FROM live_sessions s
       JOIN live_session_participants p ON p.session_id = s.id
       WHERE s.id = $1 AND p.user_id = $2 AND p.left_at IS NOT NULL
         AND s.status = 'ended' AND s.duration_sec >= 300`,
      [sessionId, userId],
    );
    if (!verification.rows.length) throw Object.assign(new Error('No qualifying completed circle session found'), { status: 403 });
    return {
      type,
      metadata: { sessionId, circleId: verification.rows[0].circle_id, durationSec: verification.rows[0].duration_sec },
      activityId: `circle-session:${sessionId}`,
      reward,
    };
  }
  if (type === 'radio_listened') {
    const sessionId = String(metadata.sessionId || '');
    const session = await client.query(
      `SELECT station_id, started_at, completed_at FROM gamification_radio_sessions
       WHERE user_id = $1 AND session_id = $2 FOR UPDATE`,
      [userId, sessionId],
    );
    if (!session.rows.length || session.rows[0].completed_at) throw Object.assign(new Error('Radio session is invalid or already completed'), { status: 409 });
    const elapsed = now.getTime() - new Date(session.rows[0].started_at).getTime();
    if (elapsed < 300_000) throw Object.assign(new Error('Radio listening threshold not reached'), { status: 409 });
    return {
      type,
      metadata: { sessionId, stationId: session.rows[0].station_id },
      activityId: `radio:${session.rows[0].station_id}:${date}`,
      reward,
    };
  }
  throw Object.assign(new Error('Unsupported activity type'), { status: 422, code: 'UNSUPPORTED_ACTIVITY' });
};

const applyActivityCounters = async (client, userId, event, now) => {
  const today = utcDate(now);
  const week = getPeriod('WEEKLY', now).key;
  switch (event.type) {
    case 'quran_page_completed':
      await incrementCounter(client, userId, 'quranPagesRead');
      await incrementCounter(client, userId, `quranPagesToday:${today}`);
      await incrementCounter(client, userId, `quranPagesWeek:${week}`);
      await client.query(
        `INSERT INTO gamification_counters (user_id, counter, value) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, counter) DO UPDATE SET value = 1, updated_at = CURRENT_TIMESTAMP`,
        [userId, `quranReadDay:${week}:${today}`],
      );
      await client.query(
        `UPDATE gamification_quran_page_sessions SET completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2 AND completed_at IS NULL`,
        [userId, event.metadata.sessionId],
      );
      break;
    case 'azkar_completed': {
      await incrementCounter(client, userId, 'azkarCategoriesCompleted');
      await incrementCounter(client, userId, `azkarWeek:${week}`);
      const categoryName = event.metadata.categoryName;
      if (categoryName === 'morning') await incrementCounter(client, userId, `morningAzkar:${today}`);
      else if (categoryName === 'evening') await incrementCounter(client, userId, `eveningAzkar:${today}`);
      break;
    }
    case 'azkar_item_completed': await incrementCounter(client, userId, 'azkarItemsCompleted'); break;
    case 'quran_audio_completed':
      await incrementCounter(client, userId, 'quranAudioCompleted');
      await client.query(
        `UPDATE gamification_quran_audio_sessions SET completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2 AND completed_at IS NULL`,
        [userId, event.metadata.sessionId],
      );
      break;
    case 'community_post_created':
    case 'community_comment_created':
      await incrementCounter(client, userId, 'communityContributions');
      await incrementCounter(client, userId, `communityWeek:${week}`);
      break;
    case 'circle_session_completed':
      await incrementCounter(client, userId, 'circleSessionsCompleted');
      await incrementCounter(client, userId, `circlesWeek:${week}`);
      break;
    case 'radio_listened':
      await incrementCounter(client, userId, 'radioSessionsCompleted');
      await client.query(
        `UPDATE gamification_radio_sessions SET completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2 AND completed_at IS NULL`,
        [userId, event.metadata.sessionId],
      );
      break;
    default: break;
  }
  if (event.reward.streak) updateStreak(event.wallet, today);
};

export const recordActivity = async (userId, requestEvent) => withTransaction(async (client) => {
  const now = new Date();
  const wallet = await ensureWallet(client, userId);
  const previousLevel = asNumber(wallet.level);
  const event = await validateAndCanonicalizeEvent(client, userId, requestEvent || {}, now);
  const prior = await client.query(
    `SELECT result FROM gamification_activities WHERE user_id = $1 AND activity_id = $2`,
    [userId, event.activityId],
  );
  if (prior.rows.length) return { ...prior.rows[0].result, duplicate: true, snapshot: await snapshotInTransaction(client, userId, wallet) };

  event.wallet = wallet;
  await applyActivityCounters(client, userId, event, now);
  const xpGained = await addLedgerEntry(client, userId, wallet, {
    key: `activity:${event.activityId}:xp`, type: 'reward', currency: 'XP',
    amount: event.reward.xp, source: event.type, sourceId: event.activityId,
  });
  const coinsGained = await addLedgerEntry(client, userId, wallet, {
    key: `activity:${event.activityId}:coins`, type: 'reward', currency: 'COIN',
    amount: event.reward.coins, source: event.type, sourceId: event.activityId,
  });
  const missions = await evaluateMissions(client, userId, wallet, now);
  const achievements = await evaluateAchievements(client, userId, wallet);
  const badges = await evaluateBadges(client, userId, wallet);
  await updateWallet(client, userId, wallet);
  const levelUp = asNumber(wallet.level) > previousLevel;
  await syncPublicSnapshot(client, userId, wallet);

  const result = {
    success: true,
    activityId: event.activityId,
    xpGained,
    coinsGained: coinsGained + missions.rewarded.reduce((sum, item) => sum + item.coins, 0)
      + achievements.rewarded.reduce((sum, item) => sum + item.coins, 0),
    levelUp,
    completedMissions: missions.completed,
    unlockedAchievements: achievements.unlocked,
    unlockedBadges: badges,
    snapshot: await snapshotInTransaction(client, userId, wallet),
  };
  await client.query(
    `INSERT INTO gamification_activities (user_id, activity_id, type, metadata, xp_delta, coins_delta, result)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb)`,
    [userId, event.activityId, event.type, JSON.stringify(event.metadata), xpGained, coinsGained, JSON.stringify(result)],
  );
  return result;
});

export const startRadioSession = async (userId, { sessionId, stationId } = {}) => withTransaction(async (client) => {
  await ensureWallet(client, userId);
  const safeSessionId = String(sessionId || '');
  const safeStationId = String(stationId || '');
  if (!/^[A-Za-z0-9:_-]{8,96}$/.test(safeSessionId) || !['1', '2', '3', '4', '5'].includes(safeStationId)) {
    throw Object.assign(new Error('Invalid radio session'), { status: 400 });
  }
  await client.query(
    `INSERT INTO gamification_radio_sessions (user_id, session_id, station_id)
     VALUES ($1, $2, $3) ON CONFLICT (user_id, session_id) DO NOTHING`,
    [userId, safeSessionId, safeStationId],
  );
  return { success: true, sessionId: safeSessionId };
});

export const startQuranAudioSession = async (userId, { sessionId, surahNumber, reciterId } = {}) => withTransaction(async (client) => {
  await ensureWallet(client, userId);
  const safeSessionId = String(sessionId || '');
  const surah = Number(surahNumber);
  const reciter = String(reciterId || '').slice(0, 64);
  if (!/^[A-Za-z0-9:_-]{8,96}$/.test(safeSessionId)
    || !Number.isInteger(surah) || surah < 1 || surah > 114
    || !/^[A-Za-z0-9._-]{1,64}$/.test(reciter)) {
    throw Object.assign(new Error('Invalid Quran audio session'), { status: 400 });
  }
  await client.query(
    `INSERT INTO gamification_quran_audio_sessions (user_id, session_id, surah_number, reciter_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, session_id) DO NOTHING`,
    [userId, safeSessionId, surah, reciter],
  );
  return { success: true, sessionId: safeSessionId };
});

export const startQuranPageSession = async (userId, { sessionId, pageNumber } = {}) => withTransaction(async (client) => {
  await ensureWallet(client, userId);
  const safeSessionId = String(sessionId || '');
  const page = Number(pageNumber);
  if (!/^[A-Za-z0-9:_-]{8,96}$/.test(safeSessionId) || !Number.isInteger(page) || page < 1 || page > 604) {
    throw Object.assign(new Error('Invalid Quran page session'), { status: 400 });
  }
  await client.query(
    `INSERT INTO gamification_quran_page_sessions (user_id, session_id, page_number)
     VALUES ($1, $2, $3) ON CONFLICT (user_id, session_id) DO NOTHING`,
    [userId, safeSessionId, page],
  );
  return { success: true, sessionId: safeSessionId };
});

export const claimDailyReward = async (userId) => withTransaction(async (client) => {
  const now = new Date();
  const today = utcDate(now);
  const wallet = await ensureWallet(client, userId);
  const claimed = await client.query(
    `SELECT reward_date, streak, xp_amount, coins_amount FROM gamification_daily_rewards
     WHERE user_id = $1 AND reward_date = $2`,
    [userId, today],
  );
  if (claimed.rows.length) return { success: true, claimed: false, snapshot: await snapshotInTransaction(client, userId, wallet) };

  updateStreak(wallet, today);
  const streakCoins = Math.min(DAILY_REWARD.maxStreakBonusCoins, wallet.current_streak * DAILY_REWARD.streakBonusCoins);
  const coins = DAILY_REWARD.baseCoins + streakCoins;
  await addLedgerEntry(client, userId, wallet, {
    key: `daily:${today}:xp`, type: 'daily_reward', currency: 'XP', amount: DAILY_REWARD.xp,
    source: 'daily_reward', sourceId: today,
  });
  await addLedgerEntry(client, userId, wallet, {
    key: `daily:${today}:coins`, type: 'daily_reward', currency: 'COIN', amount: coins,
    source: 'daily_reward', sourceId: today,
  });
  await client.query(
    `INSERT INTO gamification_daily_rewards (user_id, reward_date, streak, xp_amount, coins_amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, today, wallet.current_streak, DAILY_REWARD.xp, coins],
  );
  const achievements = await evaluateAchievements(client, userId, wallet);
  const badges = await evaluateBadges(client, userId, wallet);
  await updateWallet(client, userId, wallet);
  await syncPublicSnapshot(client, userId, wallet);
  return {
    success: true,
    claimed: true,
    reward: { xp: DAILY_REWARD.xp, coins },
    unlockedAchievements: achievements.unlocked,
    unlockedBadges: badges,
    snapshot: await snapshotInTransaction(client, userId, wallet),
  };
});

export const purchaseShopItem = async (userId, itemId, idempotencyKey) => withTransaction(async (client) => {
  const wallet = await ensureWallet(client, userId);
  const item = await getShopItem(itemId);
  if (!item) throw Object.assign(new Error('Product not found'), { status: 404, code: 'NOT_FOUND' });
  if (!item.available) throw Object.assign(new Error('Product unavailable'), { status: 409, code: 'UNAVAILABLE' });
  const key = String(idempotencyKey || '');
  if (!/^[A-Za-z0-9:_-]{8,180}$/.test(key)) throw Object.assign(new Error('Valid idempotencyKey is required'), { status: 400 });

  const existing = await client.query(
    `SELECT id, item_id, price FROM gamification_purchases WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, key],
  );
  if (existing.rows.length) return { success: true, duplicate: true, purchase: existing.rows[0], snapshot: await snapshotInTransaction(client, userId, wallet) };
  const owned = await client.query(
    `SELECT 1 FROM gamification_inventory WHERE user_id = $1 AND item_id = $2`,
    [userId, item.id],
  );
  if (owned.rows.length) throw Object.assign(new Error('Item already owned'), { status: 409, code: 'ALREADY_OWNED' });
  if (asNumber(wallet.coins) < item.price) throw Object.assign(new Error('Insufficient coins'), { status: 409, code: 'INSUFFICIENT_BALANCE' });

  const purchase = await client.query(
    `INSERT INTO gamification_purchases (user_id, item_id, price, idempotency_key)
     VALUES ($1, $2, $3, $4) RETURNING id, item_id, price, created_at`,
    [userId, item.id, item.price, key],
  );
  await client.query(
    `INSERT INTO gamification_inventory (user_id, item_id, source, purchase_id)
     VALUES ($1, $2, 'purchase', $3)`,
    [userId, item.id, purchase.rows[0].id],
  );
  await addLedgerEntry(client, userId, wallet, {
    key: `purchase:${key}:coins`, type: 'purchase', currency: 'COIN', amount: item.price,
    source: 'shop', sourceId: item.id, direction: 'DEBIT',
  });
  const ledger = await client.query(
    `SELECT id FROM gamification_wallet_transactions WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, `purchase:${key}:coins`],
  );
  await updateWallet(client, userId, wallet);
  await syncPublicSnapshot(client, userId, wallet);
  return { success: true, purchase: purchase.rows[0], transactionId: ledger.rows[0]?.id, snapshot: await snapshotInTransaction(client, userId, wallet) };
});

export const equipInventoryItem = async (userId, slot, itemId) => withTransaction(async (client) => {
  const allowedSlots = new Set(['frame', 'background', 'nameEffect', 'profileTheme', 'badge', 'avatar', 'special']);
  if (!allowedSlots.has(slot)) throw Object.assign(new Error('Invalid equip slot'), { status: 400 });
  if (itemId != null) {
    const item = await getShopItem(itemId);
    if (!item) throw Object.assign(new Error('Product not found'), { status: 404 });
    const owned = await client.query(`SELECT 1 FROM gamification_inventory WHERE user_id = $1 AND item_id = $2`, [userId, item.id]);
    if (!owned.rows.length) throw Object.assign(new Error('Item is not owned'), { status: 403 });
    const expected = { FRAME: 'frame', BACKGROUND: 'background', THEME: 'nameEffect', PROFILE_THEME: 'profileTheme', AVATAR: 'avatar', BADGE: 'badge', SPECIAL: 'special' }[item.category];
    if (expected !== slot) throw Object.assign(new Error('Item cannot be equipped in this slot'), { status: 400 });
  }
  await client.query(
    `INSERT INTO gamification_equipped (user_id, slot, item_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id, updated_at = CURRENT_TIMESTAMP`,
    [userId, slot, itemId || null],
  );
  const wallet = await ensureWallet(client, userId);
  await syncPublicSnapshot(client, userId, wallet);
  return { success: true, snapshot: await snapshotInTransaction(client, userId, wallet) };
});

export const equipInventoryItems = async (userId, requestedItems = {}) => withTransaction(async (client) => {
  const allowedSlots = new Set(['frame', 'background', 'nameEffect', 'profileTheme', 'badge', 'avatar', 'special']);
  const expectedCategory = { frame: 'FRAME', background: 'BACKGROUND', nameEffect: 'THEME', profileTheme: 'PROFILE_THEME', badge: 'BADGE', avatar: 'AVATAR', special: 'SPECIAL' };
  for (const [slot, itemId] of Object.entries(requestedItems)) {
    if (!allowedSlots.has(slot)) throw Object.assign(new Error('Invalid equip slot'), { status: 400 });
    if (itemId == null) continue;
    const item = await getShopItem(itemId);
    if (!item || item.category !== expectedCategory[slot]) throw Object.assign(new Error('Item cannot be equipped in this slot'), { status: 400 });
    const owned = await client.query(`SELECT 1 FROM gamification_inventory WHERE user_id = $1 AND item_id = $2`, [userId, item.id]);
    if (!owned.rows.length) throw Object.assign(new Error('Item is not owned'), { status: 403 });
  }
  for (const [slot, itemId] of Object.entries(requestedItems)) {
    await client.query(
      `INSERT INTO gamification_equipped (user_id, slot, item_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id, updated_at = CURRENT_TIMESTAMP`,
      [userId, slot, itemId || null],
    );
  }
  const wallet = await ensureWallet(client, userId);
  await syncPublicSnapshot(client, userId, wallet);
  return { success: true, snapshot: await snapshotInTransaction(client, userId, wallet) };
});

export const updatePublicPreferences = async (userId, payload = {}) => withTransaction(async (client) => {
  const wallet = await ensureWallet(client, userId);
  const keys = ['level', 'xp', 'progressPercentage', 'streak', 'achievements', 'featuredBadges', 'frame', 'background', 'nameEffect', 'profileTheme', 'avatar'];
  const requested = payload.visibility && typeof payload.visibility === 'object' ? payload.visibility : {};
  const visibility = Object.fromEntries(keys.map((key) => [key, typeof requested[key] === 'boolean' ? requested[key] : true]));
  const requestedBadges = Array.isArray(payload.featuredBadges) ? payload.featuredBadges.slice(0, 3).map(String) : [];
  const requestedAchievements = Array.isArray(payload.featuredAchievements) ? payload.featuredAchievements.slice(0, 3).map(String) : [];
  const [badges, achievements] = await Promise.all([
    client.query(`SELECT badge_id FROM gamification_user_badges WHERE user_id = $1 AND badge_id = ANY($2::varchar[])`, [userId, requestedBadges]),
    client.query(`SELECT achievement_id FROM gamification_achievements WHERE user_id = $1 AND unlocked = TRUE AND achievement_id = ANY($2::varchar[])`, [userId, requestedAchievements]),
  ]);
  const featuredBadges = badges.rows.map((row) => row.badge_id);
  const featuredAchievements = achievements.rows.map((row) => row.achievement_id);
  await client.query(
    `INSERT INTO user_gamification (user_id, level, total_xp, current_streak, best_streak, featured_badges, featured_achievements, visibility)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET featured_badges = EXCLUDED.featured_badges,
       featured_achievements = EXCLUDED.featured_achievements, visibility = EXCLUDED.visibility,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, wallet.level, wallet.xp, wallet.current_streak, wallet.longest_streak, JSON.stringify(featuredBadges), JSON.stringify(featuredAchievements), JSON.stringify(visibility)],
  );
  return { success: true, featuredBadges, featuredAchievements, visibility, snapshot: await snapshotInTransaction(client, userId, wallet) };
});

export const getGamificationSnapshot = async (userId) => withTransaction(async (client) => {
  const wallet = await ensureWallet(client, userId);
  return snapshotInTransaction(client, userId, wallet);
});

export const getInventory = async (userId) => withTransaction(async (client) => {
  await ensureWallet(client, userId);
  const inventory = await client.query(`SELECT item_id FROM gamification_inventory WHERE user_id = $1`, [userId]);
  const equipped = await client.query(`SELECT slot, item_id FROM gamification_equipped WHERE user_id = $1`, [userId]);
  return { ownedIds: inventory.rows.map((row) => row.item_id), equippedItems: Object.fromEntries(equipped.rows.map((row) => [row.slot, row.item_id])) };
});

export const getCatalog = async () => shopProductsModel.getAllProducts();
export const getShopItem = async (itemId) => shopProductsModel.getProductById(itemId);

export const startRadioListening = (userId, input) => startRadioSession(userId, input);

export default {
  recordActivity,
  claimDailyReward,
  purchaseShopItem,
  equipInventoryItem,
  equipInventoryItems,
  updatePublicPreferences,
  getGamificationSnapshot,
  getInventory,
  getCatalog,
  startRadioListening,
  startQuranAudioSession,
  startQuranPageSession,
};