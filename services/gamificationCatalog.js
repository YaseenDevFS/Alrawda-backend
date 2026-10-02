const RARITY_PRICE = {
  COMMON: [20, 100],
  UNCOMMON: [100, 300],
  RARE: [300, 800],
  EPIC: [800, 2000],
  LEGENDARY: [2000, 5000],
  MYTHIC: [5000, 15000],
  SPECIAL: [15000, 50000],
};

const CATEGORY_SPECS = [
  { category: 'FRAME', prefix: 'frame', count: 230, tiers: { COMMON: 80, UNCOMMON: 65, RARE: 40, EPIC: 25, LEGENDARY: 12, MYTHIC: 6, SPECIAL: 2 } },
  { category: 'BACKGROUND', prefix: 'bg', count: 220, tiers: { COMMON: 75, UNCOMMON: 60, RARE: 40, EPIC: 25, LEGENDARY: 12, MYTHIC: 6, SPECIAL: 2 } },
  { category: 'THEME', prefix: 'theme', count: 170, tiers: { COMMON: 60, UNCOMMON: 50, RARE: 30, EPIC: 18, LEGENDARY: 8, MYTHIC: 3, SPECIAL: 1 } },
  { category: 'PROFILE_THEME', prefix: 'profiletheme', count: 150, tiers: { COMMON: 50, UNCOMMON: 40, RARE: 28, EPIC: 18, LEGENDARY: 8, MYTHIC: 4, SPECIAL: 2 } },
  { category: 'AVATAR', prefix: 'avatar', count: 120, tiers: { COMMON: 40, UNCOMMON: 32, RARE: 22, EPIC: 14, LEGENDARY: 6, MYTHIC: 4, SPECIAL: 2 } },
  { category: 'BADGE', prefix: 'badge', count: 230, tiers: { COMMON: 80, UNCOMMON: 70, RARE: 45, EPIC: 22, LEGENDARY: 8, MYTHIC: 4, SPECIAL: 1 } },
  { category: 'SPECIAL', prefix: 'special', count: 160, tiers: { COMMON: 30, UNCOMMON: 40, RARE: 35, EPIC: 28, LEGENDARY: 16, MYTHIC: 8, SPECIAL: 3 } },
];

const defaultItems = [
  { id: 'frame_default', category: 'FRAME', rarity: 'COMMON', price: 0, available: true, limited: false, featured: false, isNew: false, repeatable: false },
  { id: 'bg_default', category: 'BACKGROUND', rarity: 'COMMON', price: 0, available: true, limited: false, featured: false, isNew: false, repeatable: false },
  { id: 'theme_default', category: 'THEME', rarity: 'COMMON', price: 0, available: true, limited: false, featured: false, isNew: false, repeatable: false },
];

const buildDistribution = (tiers) => Object.entries(tiers).flatMap(([tier, count]) => Array(count).fill(tier));

const buildItems = () => {
  const items = [...defaultItems];
  for (const spec of CATEGORY_SPECS) {
    const distribution = buildDistribution(spec.tiers);
    for (let index = 0; index < spec.count; index += 1) {
      const rarity = distribution[index % distribution.length];
      const [minPrice, maxPrice] = RARITY_PRICE[rarity];
      const price = Math.round(minPrice + ((maxPrice - minPrice) * ((index * 7 + 3) % 100)) / 100);
      const limited = index % 33 === 0;
      const availabilityRoll = (index * 13 + 7) % 100;
      const threshold = {
        COMMON: 95,
        UNCOMMON: 90,
        RARE: 80,
        EPIC: 60,
        LEGENDARY: 40,
        MYTHIC: 25,
        SPECIAL: 20,
      }[rarity];
      items.push({
        id: `${spec.prefix}_${spec.category}_${String(index + 1).padStart(4, '0')}`,
        category: spec.category,
        rarity,
        price,
        available: availabilityRoll < threshold,
        limited,
        featured: index % 17 === 0,
        isNew: index < 12,
        repeatable: false,
      });
    }
  }
  return items;
};

export const SHOP_CATALOG = buildItems();
export const SHOP_ITEMS_BY_ID = new Map(SHOP_CATALOG.map((item) => [item.id, item]));

export const getShopCatalog = () => SHOP_CATALOG;
export const getShopItem = (id) => SHOP_ITEMS_BY_ID.get(String(id)) || null;

export default { getShopCatalog, getShopItem, SHOP_CATALOG };