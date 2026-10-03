#!/usr/bin/env node
// backend/scripts/migrate_shop_products.js
//
// One-shot migration: copy the legacy SHOP_CATALOG (1,283 hardcoded
// JS products) into the new shop_products table.
//
// Usage:
//   node scripts/migrate_shop_products.js
//
// The script is idempotent — running it twice does not duplicate
// rows. Existing rows are updated in place via ON CONFLICT.

import shopProductsModel from '../models/shopProductsModel.js';
import { SHOP_CATALOG } from '../services/gamificationCatalog.js';

const main = async () => {
  if (!Array.isArray(SHOP_CATALOG) || !SHOP_CATALOG.length) {
    console.error('SHOP_CATALOG is empty — nothing to migrate.');
    process.exit(1);
  }

  // Strip extra presentation-only fields the DB doesn't store, and
  // ensure every record has the minimum required columns.
  const rows = SHOP_CATALOG.map((p) => ({
    id: p.id,
    name: p.name || p.id,
    description: p.description || '',
    category: p.category,
    rarity: p.rarity || 'COMMON',
    price: Number(p.price || 0),
    available: p.available !== false,
    featured: !!p.featured,
    limited: !!p.limited,
    isNew: !!p.isNew,
    repeatable: !!p.repeatable,
    theme: p.theme || null,
    collectionLabel: p.collectionLabel || null,
    designKey: 'legacy',
    assetKey: null,
    configuration: {},
  }));

  console.log(`Migrating ${rows.length} products from JS to shop_products …`);
  const result = await shopProductsModel.upsertProducts(rows);
  console.log(`✓ Migration complete: ${result.inserted} inserted, ${result.updated} updated.`);

  const counts = await shopProductsModel.countByCategory();
  console.log('Category counts in DB:', counts);

  process.exit(0);
};

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});