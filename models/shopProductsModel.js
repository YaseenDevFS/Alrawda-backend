// backend/models/shopProductsModel.js
//
// Server-authoritative shop catalog stored in PostgreSQL.
//
// All products live in the `shop_products` table. The frontend never
// defines a product locally — it renders whatever the backend returns
// from this module. Each product has a `design_key` that the frontend
// uses to look up the appropriate renderer/template; `configuration`
// holds design-specific JSON (colors, ornaments, layout hints, etc.)
// so the database never stores executable UI code.

import pool from '../db/db.js';

const PRODUCT_COLUMNS = `
  id, name, description, category, rarity, price, available, featured,
  limited, is_new, repeatable, theme, collection_label, design_key,
  asset_key, configuration
`;

const VALID_CATEGORIES = new Set([
  'FRAME', 'BACKGROUND', 'THEME', 'PROFILE_THEME', 'AVATAR', 'BADGE', 'SPECIAL',
]);
const VALID_RARITIES = new Set([
  'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'SPECIAL',
]);

const rowToProduct = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  category: row.category,
  rarity: row.rarity,
  price: Number(row.price),
  available: row.available,
  featured: row.featured,
  limited: row.limited,
  isNew: row.is_new,
  repeatable: row.repeatable,
  theme: row.theme,
  collectionLabel: row.collection_label,
  designKey: row.design_key,
  assetKey: row.asset_key,
  configuration: row.configuration || {},
});

/**
 * Fetch every product in the catalog.
 */
export const getAllProducts = async () => {
  const result = await pool.query(
    `SELECT ${PRODUCT_COLUMNS} FROM shop_products ORDER BY category, id`
  );
  return result.rows.map(rowToProduct);
};

/**
 * Fetch one product by id, or null if it does not exist.
 */
export const getProductById = async (id) => {
  const result = await pool.query(
    `SELECT ${PRODUCT_COLUMNS} FROM shop_products WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (!result.rows.length) return null;
  return rowToProduct(result.rows[0]);
};

/**
 * Bulk upsert for the migration step. Accepts an array of plain product
 * objects (the same shape produced by the legacy JS catalog). Existing
 * rows are updated in place; new rows are inserted. Safe to re-run.
 */
export const upsertProducts = async (products) => {
  if (!products.length) return { inserted: 0, updated: 0 };

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const p of products) {
      const category = (p.category || '').toString();
      const rarity = (p.rarity || 'COMMON').toString();
      if (!VALID_CATEGORIES.has(category)) {
        throw new Error(`Invalid category "${category}" on product ${p.id}`);
      }
      if (!VALID_RARITIES.has(rarity)) {
        throw new Error(`Invalid rarity "${rarity}" on product ${p.id}`);
      }

      const result = await client.query(
        `INSERT INTO shop_products (
           id, name, description, category, rarity, price, available, featured,
           limited, is_new, repeatable, theme, collection_label, design_key,
           asset_key, configuration
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14,
           $15, $16::jsonb
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           rarity = EXCLUDED.rarity,
           price = EXCLUDED.price,
           available = EXCLUDED.available,
           featured = EXCLUDED.featured,
           limited = EXCLUDED.limited,
           is_new = EXCLUDED.is_new,
           repeatable = EXCLUDED.repeatable,
           theme = EXCLUDED.theme,
           collection_label = EXCLUDED.collection_label,
           design_key = EXCLUDED.design_key,
           asset_key = EXCLUDED.asset_key,
           configuration = EXCLUDED.configuration,
           updated_at = CURRENT_TIMESTAMP
         RETURNING (xmax = 0) AS inserted`,
        [
          p.id,
          p.name || p.id,
          p.description || '',
          category,
          rarity,
          Number(p.price || 0),
          p.available !== false,
          !!p.featured,
          !!p.limited,
          !!p.isNew,
          !!p.repeatable,
          p.theme || null,
          p.collectionLabel || p.collection_label || null,
          p.designKey || p.design_key || 'legacy',
          p.assetKey || p.asset_key || null,
          JSON.stringify(p.configuration || {}),
        ]
      );
      if (result.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { inserted, updated };
};

/**
 * Counts by category for tests and observability.
 */
export const countByCategory = async () => {
  const result = await pool.query(
    `SELECT category, COUNT(*)::int AS count FROM shop_products GROUP BY category`
  );
  const map = {};
  for (const row of result.rows) map[row.category] = row.count;
  return map;
};

/**
 * Remove products that are no longer referenced anywhere. Currently
 * unused; kept for future pruning tools.
 */
export const deleteProduct = async (id) => {
  const result = await pool.query(
    'DELETE FROM shop_products WHERE id = $1',
    [id]
  );
  return result.rowCount;
};

export default {
  getAllProducts,
  getProductById,
  upsertProducts,
  countByCategory,
  deleteProduct,
};