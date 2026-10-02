export const GAMIFICATION_SCHEMA_VERSION = 2;

const BASE_XP = 100;
const LEVEL_GROWTH = 1.35;
const MAX_LEVEL = 100;

const xpRequiredForLevel = (level) => {
  if (level <= 1) return 0;
  return Math.round(BASE_XP * ((LEVEL_GROWTH ** (level - 1) - 1) / (LEVEL_GROWTH - 1)));
};

export const getLevelForXP = (xp) => {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let candidate = 2; candidate <= MAX_LEVEL; candidate += 1) {
    if (total >= xpRequiredForLevel(candidate)) level = candidate;
    else break;
  }
  const current = xpRequiredForLevel(level);
  const next = xpRequiredForLevel(level + 1);
  const maxed = level === MAX_LEVEL || next <= current;
  const span = maxed ? current : next - current;
  const inLevel = total - current;
  return {
    level,
    xpInLevel: inLevel,
    xpToNext: maxed ? 0 : Math.max(0, span - inLevel),
    progress: maxed ? 1 : Math.min(1, inLevel / span),
    isMaxLevel: maxed,
  };
};

export const ACTIVITY_REWARDS = {
  quran_page_completed: { xp: 5, coins: 0, counter: 'quranPagesRead', streak: true },
  quran_audio_completed: { xp: 15, coins: 0, counter: 'quranAudioCompleted', streak: true },
  azkar_item_completed: { xp: 2, coins: 0, counter: 'azkarItemsCompleted', streak: false },
  azkar_completed: { xp: 10, coins: 0, counter: 'azkarCategoriesCompleted', streak: true },
  hadith_completed: { xp: 3, coins: 0, counter: 'hadithsRead', streak: false },
  quiz_completed: { xp: 15, coins: 10, counter: 'quizzesCompleted', streak: false },
  community_post_created: { xp: 10, coins: 5, counter: 'communityContributions', streak: false },
  community_comment_created: { xp: 3, coins: 0, counter: 'communityContributions', streak: false },
  circle_session_completed: { xp: 30, coins: 10, counter: 'circleSessionsCompleted', streak: true },
  radio_listening_started: { xp: 0, coins: 0, counter: null, streak: false },
  radio_listened: { xp: 5, coins: 0, counter: 'radioSessionsCompleted', streak: false },
};

export const MISSION_DEFINITIONS = [
  { id: 'daily_quran_pages', title: 'Daily Reader', description: 'Read 5 Quran pages today.', type: 'quranPagesToday', target: 5, frequency: 'DAILY', rewardXP: 25, rewardCoins: 20, route: 'Quran', params: {} },
  { id: 'daily_azkar_morning', title: 'Morning Azkar', description: 'Complete Morning Azkar.', type: 'morningAzkarToday', target: 1, frequency: 'DAILY', rewardXP: 20, rewardCoins: 10, route: 'Azkar', params: { categoryHint: 'morning' } },
  { id: 'daily_azkar_evening', title: 'Evening Azkar', description: 'Complete Evening Azkar.', type: 'eveningAzkarToday', target: 1, frequency: 'DAILY', rewardXP: 20, rewardCoins: 10, route: 'Azkar', params: { categoryHint: 'evening' } },
  { id: 'weekly_quran_days', title: 'Weekly Devotee', description: 'Read Quran on 5 different days this week.', type: 'quranDaysThisWeek', target: 5, frequency: 'WEEKLY', rewardXP: 100, rewardCoins: 100, route: 'Quran', params: {} },
  { id: 'weekly_pages', title: 'Weekly Reader', description: 'Read 30 Quran pages this week.', type: 'quranPagesThisWeek', target: 30, frequency: 'WEEKLY', rewardXP: 120, rewardCoins: 80, route: 'Quran', params: {} },
  { id: 'weekly_azkar', title: 'Azkar Habit', description: 'Complete 7 Azkar categories this week.', type: 'azkarThisWeek', target: 7, frequency: 'WEEKLY', rewardXP: 80, rewardCoins: 60, route: 'Azkar', params: {} },
  { id: 'weekly_community', title: 'Community Voice', description: 'Make 3 community contributions this week.', type: 'communityThisWeek', target: 3, frequency: 'WEEKLY', rewardXP: 60, rewardCoins: 40, route: 'Community', params: {} },
  { id: 'weekly_circle_sessions', title: 'Circle Companion', description: 'Attend 3 completed circle sessions this week.', type: 'circlesThisWeek', target: 3, frequency: 'WEEKLY', rewardXP: 100, rewardCoins: 80, route: 'CirclesList', params: {} },
];

export const ACHIEVEMENT_DEFINITIONS = [
  { id: 'first_page', name: 'First Steps', description: 'Complete your first Quran page.', type: 'quranPagesRead', target: 1, rewardXP: 25, rewardCoins: 15 },
  { id: 'pages_10', name: 'Page Turner', description: 'Complete 10 Quran pages.', type: 'quranPagesRead', target: 10, rewardXP: 30, rewardCoins: 20 },
  { id: 'pages_100', name: 'Knowledge Seeker', description: 'Complete 100 Quran pages.', type: 'quranPagesRead', target: 100, rewardXP: 100, rewardCoins: 75 },
  { id: 'pages_604', name: 'Quran Complete', description: 'Complete 604 Quran pages.', type: 'quranPagesRead', target: 604, rewardXP: 500, rewardCoins: 1000 },
  { id: 'streak_7', name: 'Consistent', description: 'Reach a 7-day activity streak.', type: 'streak', target: 7, rewardXP: 50, rewardCoins: 30 },
  { id: 'streak_30', name: 'Dedicated', description: 'Reach a 30-day activity streak.', type: 'streak', target: 30, rewardXP: 200, rewardCoins: 150 },
  { id: 'hadith_100', name: 'Hadith Student', description: 'Complete 100 Hadith readings.', type: 'hadithsRead', target: 100, rewardXP: 100, rewardCoins: 75 },
  { id: 'azkar_complete', name: 'Azkar Devotee', description: 'Complete 5 Azkar categories.', type: 'azkarCategoriesCompleted', target: 5, rewardXP: 150, rewardCoins: 100 },
  { id: 'azkar_50', name: 'Steady Remembrance', description: 'Complete 50 Azkar categories.', type: 'azkarCategoriesCompleted', target: 50, rewardXP: 200, rewardCoins: 150 },
  { id: 'quiz_10', name: 'Quiz Whiz', description: 'Complete 10 quizzes.', type: 'quizzesCompleted', target: 10, rewardXP: 80, rewardCoins: 60 },
  { id: 'community_50', name: 'Community Pillar', description: 'Make 50 community contributions.', type: 'communityContributions', target: 50, rewardXP: 100, rewardCoins: 75 },
  { id: 'circle_sessions_10', name: 'Circle Regular', description: 'Complete 10 circle sessions.', type: 'circleSessionsCompleted', target: 10, rewardXP: 150, rewardCoins: 100 },
];

export const DAILY_REWARD = { xp: 10, baseCoins: 15, streakBonusCoins: 2, maxStreakBonusCoins: 30 };

export const getPeriod = (frequency, now = new Date()) => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = date.getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const dateKey = date.toISOString().slice(0, 10);
  if (frequency === 'DAILY') return { key: dateKey, start: dateKey, end: dateKey };
  return {
    key: `W${start.toISOString().slice(0, 10)}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

export default {
  GAMIFICATION_SCHEMA_VERSION,
  ACTIVITY_REWARDS,
  MISSION_DEFINITIONS,
  ACHIEVEMENT_DEFINITIONS,
  DAILY_REWARD,
  getLevelForXP,
  getPeriod,
};