const { db } = require('./db');

// Coordinates for key Kampala zones and landmarks for accurate distance estimation
const KAMPALA_LANDMARKS = {
  'kikuubo': { name: 'Kikuubo / Downtown Kampala', lat: 0.3136, lng: 32.5768 },
  'downtown': { name: 'Central Kampala (Downtown)', lat: 0.3136, lng: 32.5768 },
  'nakasero': { name: 'Nakasero', lat: 0.3211, lng: 32.5786 },
  'kololo': { name: 'Kololo', lat: 0.3283, lng: 32.5925 },
  'kamwokya': { name: 'Kamwokya', lat: 0.3392, lng: 32.5857 },
  'ntinda': { name: 'Ntinda', lat: 0.3544, lng: 32.6133 },
  'bugolobi': { name: 'Bugolobi', lat: 0.3168, lng: 32.6186 },
  'luzira': { name: 'Luzira', lat: 0.3015, lng: 32.6375 },
  'makerere': { name: 'Makerere / Wandegeya', lat: 0.3338, lng: 32.5694 },
  'wandegeya': { name: 'Wandegeya', lat: 0.3312, lng: 32.5710 },
  'mengo': { name: 'Mengo / Rubaga', lat: 0.3060, lng: 32.5562 },
  'rubaga': { name: 'Rubaga', lat: 0.3020, lng: 32.5520 },
  'kansanga': { name: 'Kansanga / Ggaba Road', lat: 0.2865, lng: 32.6025 },
  'ggaba': { name: 'Ggaba', lat: 0.2600, lng: 32.6280 },
  'muyenga': { name: 'Muyenga', lat: 0.2980, lng: 32.6120 },
  'kabalagala': { name: 'Kabalagala', lat: 0.2990, lng: 32.5950 },
  'naalya': { name: 'Naalya', lat: 0.3700, lng: 32.6350 },
  'kiwatule': { name: 'Kiwatule', lat: 0.3620, lng: 32.6200 },
  'kira': { name: 'Kira Town', lat: 0.3950, lng: 32.6450 },
  'namugongo': { name: 'Namugongo', lat: 0.3870, lng: 32.6510 },
  'entebbe road': { name: 'Entebbe Road / Najjanankumbi', lat: 0.2780, lng: 32.5650 },
  'banda': { name: 'Banda / Kyambogo', lat: 0.3470, lng: 32.6320 },
  'bweyogerere': { name: 'Bweyogerere', lat: 0.3550, lng: 32.6700 },
  'kalerwe': { name: 'Kalerwe / Bwaise', lat: 0.3500, lng: 32.5680 },
  'acacia': { name: 'Acacia Mall / Kisementi', lat: 0.3340, lng: 32.5875 }
};

// Haversine formula with Kampala road tortuosity factor (~1.35x straight line)
function calculateKampalaDistance(loc1Str, loc2Str) {
  const p1 = findClosestLandmark(loc1Str);
  const p2 = findClosestLandmark(loc2Str);

  if (p1 && p2) {
    if (p1.name === p2.name) {
      return 2.5; // Short local trip within same neighbourhood
    }
    const R = 6371; // km
    const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
    const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightDistance = R * c;
    const roadDistance = straightDistance * 1.38; // Kampala road network factor
    return Math.max(2.0, Math.round(roadDistance * 10) / 10);
  }

  // Fallback realistic Kampala distance based on string length hashing or average
  return 5.5;
}

function findClosestLandmark(text) {
  if (!text) return null;
  const clean = text.toLowerCase();
  for (const [key, coords] of Object.entries(KAMPALA_LANDMARKS)) {
    if (clean.includes(key)) {
      return coords;
    }
  }
  return null;
}

// Fetch active pricing rules from database
function getActivePricingRules() {
  const rules = db.prepare('SELECT * FROM pricing_rules ORDER BY id DESC LIMIT 1').get();
  if (!rules) {
    return {
      base_fee: 4000,
      per_km_rate: 800,
      min_fee: 3500,
      urgent_surcharge: 3000,
      category_surcharges: {
        document: 0,
        small_parcel: 500,
        medium_box: 1500,
        large_package: 3000,
        groceries: 1000,
        fragile: 2000
      }
    };
  }

  return {
    id: rules.id,
    base_fee: rules.base_fee,
    per_km_rate: rules.per_km_rate,
    min_fee: rules.min_fee,
    urgent_surcharge: rules.urgent_surcharge,
    category_surcharges: typeof rules.category_surcharges === 'string'
      ? JSON.parse(rules.category_surcharges)
      : rules.category_surcharges,
    updated_at: rules.updated_at
  };
}

// Calculate delivery price
function calculateDeliveryQuote({ pickup, destination, category = 'small_parcel', is_urgent = false, custom_km = null }) {
  const rules = getActivePricingRules();

  const distance_km = custom_km ? parseFloat(custom_km) : calculateKampalaDistance(pickup, destination);
  const base_fee = rules.base_fee;
  const distance_fee = Math.round(distance_km * rules.per_km_rate);
  const category_fee = rules.category_surcharges[category] || 0;
  const urgent_fee = is_urgent ? rules.urgent_surcharge : 0;

  const raw_total = base_fee + distance_fee + category_fee + urgent_fee;
  // Enforce minimum fee & round to nearest 500 UGX
  const total_fee = Math.max(rules.min_fee, Math.round(raw_total / 100) * 100);

  return {
    distance_km,
    base_fee,
    per_km_rate: rules.per_km_rate,
    distance_fee,
    category,
    category_fee,
    is_urgent: !!is_urgent,
    urgent_fee,
    min_fee: rules.min_fee,
    total_fee,
    currency: 'UGX'
  };
}

// Update pricing rules (Admin only)
function updatePricingRules({ base_fee, per_km_rate, min_fee, urgent_surcharge, category_surcharges }) {
  const categoryStr = typeof category_surcharges === 'object'
    ? JSON.stringify(category_surcharges)
    : category_surcharges;

  const result = db.prepare(`
    UPDATE pricing_rules
    SET base_fee = ?, per_km_rate = ?, min_fee = ?, urgent_surcharge = ?, category_surcharges = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM pricing_rules ORDER BY id DESC LIMIT 1)
  `).run(
    Number(base_fee),
    Number(per_km_rate),
    Number(min_fee),
    Number(urgent_surcharge),
    categoryStr
  );

  return getActivePricingRules();
}

module.exports = {
  KAMPALA_LANDMARKS,
  calculateKampalaDistance,
  getActivePricingRules,
  calculateDeliveryQuote,
  updatePricingRules
};
