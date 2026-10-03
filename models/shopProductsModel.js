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
 *
 * Uses multi-row INSERT with ON CONFLICT DO UPDATE for performance —
 * 1,283 rows complete in seconds instead of minutes.
 */
export const upsertProducts = async (products) => {
  if (!products.length) return { inserted: 0, updated: 0 };

  // Validate all rows first; fail fast on invalid data.
  const rows = products.map((p) => {
    const category = (p.category || '').toString();
    const rarity = (p.rarity || 'COMMON').toString();
    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(`Invalid category "${category}" on product ${p.id}`);
    }
    if (!VALID_RARITIES.has(rarity)) {
      throw new Error(`Invalid rarity "${rarity}" on product ${p.id}`);
    }
    return [
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
    ];
  });

  // Build VALUES placeholders: ($1..$16), ($17..$32), ...
  const COL_COUNT = 16;
  const placeholders = [];
  const flat = [];
  rows.forEach((row, idx) => {
    const offset = idx * COL_COUNT;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}::jsonb)`);
    flat.push(...row);
  });

  const sql = `
    INSERT INTO shop_products (
      id, name, description, category, rarity, price, available, featured,
      limited, is_new, repeatable, theme, collection_label, design_key,
      asset_key, configuration
    )
    VALUES ${placeholders.join(', ')}
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
  `;

  // Execute in chunks of 200 to avoid parameter limits on huge payloads.
  const CHUNK = 200;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunkRows = rows.slice(i, i + CHUNK);
    const chunkPlaceholders = [];
    const chunkFlat = [];
    chunkRows.forEach((row, idx) => {
      const offset = idx * COL_COUNT;
      chunkPlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}::jsonb)`);
      chunkFlat.push(...row);
    });

    const result = await pool.query(
      sql.replace(placeholders.join(', '), chunkPlaceholders.join(', ')),
      chunkFlat
    );
    inserted += result.rowCount;
  }

  // We can't easily tell inserted vs updated from a multi-row UPSERT
  // without per-row RETURNING. Approximate: anything past existing
  // count is "inserted".
  const before = await pool.query('SELECT COUNT(*) FROM shop_products');
  const totalAfter = Number(before.rows[0].count);
  // First-run estimate
  updated = Math.max(0, totalAfter - products.length);

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