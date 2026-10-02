import assert from 'node:assert/strict';
import test from 'node:test';
import { SHOP_CATALOG } from '../services/gamificationCatalog.js';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACTIVITY_REWARDS,
  MISSION_DEFINITIONS,
  getLevelForXP,
  getPeriod,
} from '../services/gamificationConfig.js';

const countBy = (items, key) => items.reduce((counts, item) => {
  counts[item[key]] = (counts[item[key]] || 0) + 1;
  return counts;
}, {});

test('server shop catalog keeps 1,283 unique IDs and existing category counts', () => {
  assert.equal(SHOP_CATALOG.length, 1283);
  assert.equal(new Set(SHOP_CATALOG.map((item) => item.id)).size, SHOP_CATALOG.length);
  assert.deepEqual(countBy(SHOP_CATALOG.slice(3), 'category'), {
    FRAME: 230,
    BACKGROUND: 220,
    THEME: 170,
    PROFILE_THEME: 150,
    AVATAR: 120,
    BADGE: 230,
    SPECIAL: 160,
  });
});

test('catalog prices and availability are server-owned, valid values', () => {
  for (const item of SHOP_CATALOG) {
    assert.ok(Number.isInteger(item.price) && item.price >= 0);
    assert.equal(typeof item.available, 'boolean');
    assert.equal(typeof item.featured, 'boolean');
    assert.equal(typeof item.limited, 'boolean');
  }
  assert.equal(SHOP_CATALOG.find((item) => item.id === 'frame_default')?.price, 0);
  assert.ok(SHOP_CATALOG.some((item) => item.rarity === 'SPECIAL' && item.price >= 15000));
});

test('server reward configuration contains only non-negative integer rewards', () => {
  for (const reward of Object.values(ACTIVITY_REWARDS)) {
    assert.ok(Number.isInteger(reward.xp) && reward.xp >= 0);
    assert.ok(Number.isInteger(reward.coins) && reward.coins >= 0);
  }
  assert.ok(MISSION_DEFINITIONS.length > 0);
  assert.ok(ACHIEVEMENT_DEFINITIONS.length > 0);
});

test('XP level calculation and UTC mission periods are deterministic', () => {
  assert.equal(getLevelForXP(0).level, 1);
  assert.equal(getLevelForXP(100).level, 2);
  assert.ok(getLevelForXP(5000).level > 2);
  const date = new Date('2026-10-02T12:00:00.000Z');
  assert.equal(getPeriod('DAILY', date).key, '2026-10-02');
  assert.deepEqual(getPeriod('WEEKLY', date), {
    key: 'W2026-09-28',
    start: '2026-09-28',
    end: '2026-10-04',
  });
});
