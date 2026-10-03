#!/usr/bin/env node
// backend/scripts/check_db.js
// Quick check: how many products are in shop_products right now?

import shopProductsModel from '../models/shopProductsModel.js';

shopProductsModel.countByCategory().then((counts) => {
  console.log('Current shop_products counts by category:');
  console.log(JSON.stringify(counts, null, 2));
  shopProductsModel.getAllProducts().then((all) => {
    console.log(`\nTotal in shop_products: ${all.length}`);
    process.exit(0);
  });
}).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});