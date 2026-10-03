#!/usr/bin/env node
// backend/scripts/seed_premium_products.js
//
// Inserts the hand-curated premium product catalog (70 products
// across 7 categories) into the shop_products table.
//
// Usage:
//   node scripts/seed_premium_products.js
//
// Idempotent — re-running does not duplicate rows.

import shopProductsModel from '../models/shopProductsModel.js';
import { PREMIUM_PRODUCTS, PREMIUM_PRODUCT_COUNT } from './premium_shop_products.js';

const main = async () => {
  console.log(`Seeding ${PREMIUM_PRODUCT_COUNT} premium products …`);
  const result = await shopProductsModel.upsertProducts(PREMIUM_PRODUCTS);
  console.log(`✓ Seed complete: ${result.inserted} inserted, ${result.updated} updated.`);
  const counts = await shopProductsModel.countByCategory();
  console.log('Category counts in DB after seed:', counts);
  process.exit(0);
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});