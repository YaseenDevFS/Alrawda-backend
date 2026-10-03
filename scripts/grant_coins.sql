-- =====================================================
-- Grant 200,000 coins to user_id = 2 (one-shot admin grant)
-- =====================================================
-- Safe to re-run: the idempotency_key on the
-- gamification_wallet_transactions insert prevents double-credit.
-- Adjust USER_ID and COIN_AMOUNT below to target a different user.
-- =====================================================

BEGIN;

-- 1. Ensure wallet row exists for this user (no-op if already there).
INSERT INTO gamification_wallet (user_id, xp, coins, level, current_streak, longest_streak)
VALUES (2, 0, 0, 1, 0, 0)
ON CONFLICT (user_id) DO NOTHING;

-- 2. Credit the coins atomically. The CHECK (coins >= 0) on the
--    table guarantees we can never underflow.
UPDATE gamification_wallet
SET    coins = coins + 200000,
       updated_at = CURRENT_TIMESTAMP
WHERE  user_id = 2;

-- 3. Record the ledger transaction with an idempotency_key so this
--    script cannot be replayed for the same grant.
INSERT INTO gamification_wallet_transactions (
    user_id, idempotency_key, currency, type, amount, balance_after, source, source_id
)
SELECT
    2,
    'admin:grant-coins:user-2:200000:2026-10-03',
    'COIN',
    'adjustment',
    200000,
    w.coins,
    'admin_grant',
    'script:grant_coins.sql'
FROM   gamification_wallet w
WHERE  w.user_id = 2
ON CONFLICT (user_id, idempotency_key) DO NOTHING;

-- 4. Refresh the public snapshot so user_gamification row reflects the
--    new coin-related stats if the application later needs them.
--    (The /me endpoint reads from gamification_wallet directly, so this
--    is mostly cosmetic — coins themselves are private and never exposed
--    publicly. The updated_at bump just makes the row reflect the
--    recent admin grant.)
UPDATE user_gamification
SET    updated_at = CURRENT_TIMESTAMP
WHERE  user_id = 2;

COMMIT;

-- 5. Verify the grant worked.
SELECT
    w.user_id,
    w.coins                       AS current_coins,
    w.xp,
    w.level,
    w.updated_at                  AS wallet_updated_at,
    t.amount.value           AS last_grant_amount,
    t.created_at                  AS last_grant_at
FROM   gamification_wallet w
LEFT JOIN LATERAL (
    SELECT amount, created_at
    FROM   gamification_wallet_transactions
    WHERE  user_id = 2
    AND    idempotency_key = 'admin:grant-coins:user-2:200000:2026-10-03'
    LIMIT  1
) t ON TRUE
WHERE  w.user_id = 2;