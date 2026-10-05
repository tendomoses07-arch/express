const { db } = require('./db');

// Comprehensive geographical coordinates for Cities, Municipalities, Towns, Districts,
// and Key Hubs spanning ALL regions of Uganda (Central, Eastern, Western, Northern).
const UGANDA_LOCATIONS = {
  // =========================================================================
  // CENTRAL REGION — Kampala Capital City & Metropolitan Area
  // =========================================================================
  'kampala': { name: 'Kampala City Center', lat: 0.3476, lng: 32.5825, region: 'Central' },
  'kikuubo': { name: 'Kikuubo / Downtown Kampala', lat: 0.3136, lng: 32.5768, region: 'Central' },
  'downtown': { name: 'Central Kampala (Downtown)', lat: 0.3136, lng: 32.5768, region: 'Central' },
  'nakasero': { name: 'Nakasero', lat: 0.3211, lng: 32.5786, region: 'Central' },
  'kololo': { name: 'Kololo', lat: 0.3283, lng: 32.5925, region: 'Central' },
  'kamwokya': { name: 'Kamwokya / Kisementi', lat: 0.3392, lng: 32.5857, region: 'Central' },
  'acacia': { name: 'Acacia Mall / Kisementi', lat: 0.3340, lng: 32.5875, region: 'Central' },
  'ntinda': { name: 'Ntinda', lat: 0.3544, lng: 32.6133, region: 'Central' },
  'bugolobi': { name: 'Bugolobi', lat: 0.3168, lng: 32.6186, region: 'Central' },
  'luzira': { name: 'Luzira / Port Bell', lat: 0.3015, lng: 32.6375, region: 'Central' },
  'makerere': { name: 'Makerere University / Wandegeya', lat: 0.3338, lng: 32.5694, region: 'Central' },
  'wandegeya': { name: 'Wandegeya', lat: 0.3312, lng: 32.5710, region: 'Central' },
  'mengo': { name: 'Mengo / Bulange', lat: 0.3060, lng: 32.5562, region: 'Central' },
  'rubaga': { name: 'Rubaga', lat: 0.3020, lng: 32.5520, region: 'Central' },
  'kansanga': { name: 'Kansanga / Ggaba Road', lat: 0.2865, lng: 32.6025, region: 'Central' },
  'ggaba': { name: 'Ggaba / Lake Victoria', lat: 0.2600, lng: 32.6280, region: 'Central' },
  'muyenga': { name: 'Muyenga Tank Hill', lat: 0.2980, lng: 32.6120, region: 'Central' },
  'kabalagala': { name: 'Kabalagala', lat: 0.2990, lng: 32.5950, region: 'Central' },
  'naalya': { name: 'Naalya / Metroplex', lat: 0.3700, lng: 32.6350, region: 'Central' },
  'kiwatule': { name: 'Kiwatule', lat: 0.3620, lng: 32.6200, region: 'Central' },
  'kira': { name: 'Kira Municipality', lat: 0.3950, lng: 32.6450, region: 'Central' },
  'namugongo': { name: 'Namugongo Martyrs Shrine', lat: 0.3870, lng: 32.6510, region: 'Central' },
  'banda': { name: 'Banda / Kyambogo', lat: 0.3470, lng: 32.6320, region: 'Central' },
  'kyambogo': { name: 'Kyambogo', lat: 0.3490, lng: 32.6300, region: 'Central' },
  'bweyogerere': { name: 'Bweyogerere / Namboole', lat: 0.3550, lng: 32.6700, region: 'Central' },
  'kalerwe': { name: 'Kalerwe Market', lat: 0.3500, lng: 32.5680, region: 'Central' },
  'bwaise': { name: 'Bwaise', lat: 0.3480, lng: 32.5590, region: 'Central' },
  'nansana': { name: 'Nansana Municipality', lat: 0.3650, lng: 32.5270, region: 'Central' },
  'kasangati': { name: 'Kasangati / Gayaza Road', lat: 0.4420, lng: 32.6040, region: 'Central' },
  'gayaza': { name: 'Gayaza', lat: 0.4530, lng: 32.6120, region: 'Central' },
  'kireka': { name: 'Kireka', lat: 0.3480, lng: 32.6490, region: 'Central' },
  'nateete': { name: 'Nateete', lat: 0.2980, lng: 32.5320, region: 'Central' },
  'kawempe': { name: 'Kawempe', lat: 0.3630, lng: 32.5570, region: 'Central' },
  'bukoto': { name: 'Bukoto', lat: 0.3520, lng: 32.5990, region: 'Central' },
  'naguru': { name: 'Naguru Hill', lat: 0.3390, lng: 32.6070, region: 'Central' },
  'munyonyo': { name: 'Munyonyo / Speke Resort', lat: 0.2380, lng: 32.6180, region: 'Central' },
  'najjanankumbi': { name: 'Najjanankumbi / Entebbe Road', lat: 0.2800, lng: 32.5650, region: 'Central' },
  'lubowa': { name: 'Lubowa / Quality Mall', lat: 0.2450, lng: 32.5600, region: 'Central' },
  'kajjansi': { name: 'Kajjansi Town / Entebbe Road', lat: 0.2150, lng: 32.5350, region: 'Central' },
  'seguku': { name: 'Seguku / Entebbe Road', lat: 0.2500, lng: 32.5530, region: 'Central' },
  'bunamwaya': { name: 'Bunamwaya', lat: 0.2650, lng: 32.5450, region: 'Central' },
  'zana': { name: 'Zana / Entebbe Road', lat: 0.2680, lng: 32.5580, region: 'Central' },
  'kyengera': { name: 'Kyengera / Masaka Road', lat: 0.2880, lng: 32.5050, region: 'Central' },
  'nsangi': { name: 'Nsangi Town / Masaka Road', lat: 0.2650, lng: 32.4600, region: 'Central' },
  'buloba': { name: 'Buloba / Mityana Road', lat: 0.3290, lng: 32.4480, region: 'Central' },
  'matugga': { name: 'Matugga Town / Bombo Road', lat: 0.4680, lng: 32.5180, region: 'Central' },
  'busega': { name: 'Busega Roundabout / Northern Bypass', lat: 0.3040, lng: 32.5150, region: 'Central' },
  'kalagi': { name: 'Kalagi Town / Mukono-Kayunga Road', lat: 0.5050, lng: 32.7950, region: 'Central' },
  'kalangala': { name: 'Kalangala (Ssese Islands)', lat: -0.3089, lng: 32.2250, region: 'Central' },
  'buvuma': { name: 'Buvuma Island', lat: 0.2500, lng: 33.2500, region: 'Central' },

  // =========================================================================
  // CENTRAL REGION — Districts & Greater Central Corridor
  // =========================================================================
  'entebbe': { name: 'Entebbe Municipality / Airport', lat: 0.0512, lng: 32.4637, region: 'Central' },
  'wakiso': { name: 'Wakiso District Headquarters', lat: 0.4044, lng: 32.4594, region: 'Central' },
  'mukono': { name: 'Mukono Municipality', lat: 0.3544, lng: 32.7553, region: 'Central' },
  'seeta': { name: 'Seeta, Mukono', lat: 0.3600, lng: 32.7100, region: 'Central' },
  'lugazi': { name: 'Lugazi Municipality', lat: 0.3789, lng: 32.9378, region: 'Central' },
  'buikwe': { name: 'Buikwe District', lat: 0.3333, lng: 33.0333, region: 'Central' },
  'kayunga': { name: 'Kayunga Town', lat: 0.7025, lng: 32.8886, region: 'Central' },
  'masaka': { name: 'Masaka City', lat: -0.3341, lng: 31.7341, region: 'Central' },
  'nyendo': { name: 'Nyendo, Masaka', lat: -0.3200, lng: 31.7500, region: 'Central' },
  'mpigi': { name: 'Mpigi Town', lat: 0.2250, lng: 32.3139, region: 'Central' },
  'mityana': { name: 'Mityana Municipality', lat: 0.3986, lng: 32.0428, region: 'Central' },
  'mubende': { name: 'Mubende Municipality', lat: 0.5583, lng: 31.3944, region: 'Central' },
  'luweero': { name: 'Luweero Town', lat: 0.8492, lng: 32.4731, region: 'Central' },
  'luwero': { name: 'Luweero Town', lat: 0.8492, lng: 32.4731, region: 'Central' },
  'wobulenzi': { name: 'Wobulenzi Town', lat: 0.7200, lng: 32.5250, region: 'Central' },
  'bombo': { name: 'Bombo Town', lat: 0.5833, lng: 32.5333, region: 'Central' },
  'nakasongola': { name: 'Nakasongola Town', lat: 1.3089, lng: 32.4564, region: 'Central' },
  'kiboga': { name: 'Kiboga Town', lat: 0.9161, lng: 31.7742, region: 'Central' },
  'kyotera': { name: 'Kyotera Town', lat: -0.6350, lng: 31.5450, region: 'Central' },
  'mutukula': { name: 'Mutukula Border Post', lat: -1.0000, lng: 31.4167, region: 'Central' },
  'lyantonde': { name: 'Lyantonde Town', lat: -0.4033, lng: 31.1578, region: 'Central' },
  'sembabule': { name: 'Sembabule Town', lat: -0.0789, lng: 31.4589, region: 'Central' },
  'kalungu': { name: 'Kalungu District', lat: -0.1783, lng: 31.7644, region: 'Central' },
  'butambala': { name: 'Gombe / Butambala', lat: 0.1833, lng: 32.1167, region: 'Central' },

  // =========================================================================
  // EASTERN REGION — Jinja, Busoga, Bugisu, Bukedi & Teso
  // =========================================================================
  'jinja': { name: 'Jinja City (Source of the Nile)', lat: 0.4479, lng: 33.2026, region: 'Eastern' },
  'bugembe': { name: 'Bugembe, Jinja', lat: 0.4700, lng: 33.2400, region: 'Eastern' },
  'kakira': { name: 'Kakira, Jinja', lat: 0.5050, lng: 33.2800, region: 'Eastern' },
  'iganga': { name: 'Iganga Municipality', lat: 0.6094, lng: 33.4686, region: 'Eastern' },
  'mbale': { name: 'Mbale City (Mount Elgon)', lat: 1.0784, lng: 34.1756, region: 'Eastern' },
  'tororo': { name: 'Tororo Municipality (Rock City)', lat: 0.6928, lng: 34.1809, region: 'Eastern' },
  'busia': { name: 'Busia Municipality (Border Post)', lat: 0.4667, lng: 34.0903, region: 'Eastern' },
  'soroti': { name: 'Soroti City', lat: 1.7147, lng: 33.6111, region: 'Eastern' },
  'kumi': { name: 'Kumi Municipality', lat: 1.4897, lng: 33.9364, region: 'Eastern' },
  'kapchorwa': { name: 'Kapchorwa Municipality (Sipi Falls)', lat: 1.4000, lng: 34.4500, region: 'Eastern' },
  'bugiri': { name: 'Bugiri Municipality', lat: 0.5714, lng: 33.7417, region: 'Eastern' },
  'kamuli': { name: 'Kamuli Municipality', lat: 0.9472, lng: 33.1197, region: 'Eastern' },
  'pallisa': { name: 'Pallisa Town', lat: 1.1450, lng: 33.7125, region: 'Eastern' },
  'mayuge': { name: 'Mayuge Town', lat: 0.4589, lng: 33.4808, region: 'Eastern' },
  'kaliro': { name: 'Kaliro Town', lat: 0.8950, lng: 33.5042, region: 'Eastern' },
  'buyende': { name: 'Buyende Town', lat: 1.1667, lng: 33.1667, region: 'Eastern' },
  'bukedea': { name: 'Bukedea Town', lat: 1.3467, lng: 34.0433, region: 'Eastern' },
  'sironko': { name: 'Sironko Town', lat: 1.2314, lng: 34.2486, region: 'Eastern' },
  'bududa': { name: 'Bududa Town', lat: 1.0100, lng: 34.3333, region: 'Eastern' },
  'manafwa': { name: 'Manafwa Town', lat: 0.9167, lng: 34.2833, region: 'Eastern' },
  'ngora': { name: 'Ngora Town', lat: 1.4583, lng: 33.7750, region: 'Eastern' },
  'serere': { name: 'Serere Town', lat: 1.4983, lng: 33.4489, region: 'Eastern' },
  'kaberamaido': { name: 'Kaberamaido Town', lat: 1.7681, lng: 33.1583, region: 'Eastern' },
  'amuria': { name: 'Amuria Town', lat: 2.0306, lng: 33.6428, region: 'Eastern' },

  // =========================================================================
  // WESTERN REGION — Ankole, Kigezi, Tooro, Bunyoro & Rwenzori
  // =========================================================================
  'mbarara': { name: 'Mbarara City (Land of Milk)', lat: -0.6072, lng: 30.6545, region: 'Western' },
  'fort portal': { name: 'Fort Portal Tourism City', lat: 0.6544, lng: 30.2744, region: 'Western' },
  'fortportal': { name: 'Fort Portal Tourism City', lat: 0.6544, lng: 30.2744, region: 'Western' },
  'kasese': { name: 'Kasese Municipality (Rwenzori)', lat: 0.1833, lng: 30.0833, region: 'Western' },
  'kabale': { name: 'Kabale Municipality (Switzerland of Africa)', lat: -1.2486, lng: 29.9892, region: 'Western' },
  'hoima': { name: 'Hoima Oil City', lat: 1.4331, lng: 31.3522, region: 'Western' },
  'masindi': { name: 'Masindi Municipality', lat: 1.6744, lng: 31.7150, region: 'Western' },
  'bushenyi': { name: 'Bushenyi Municipality', lat: -0.5408, lng: 30.1386, region: 'Western' },
  'ishaka': { name: 'Ishaka Town', lat: -0.5450, lng: 30.1390, region: 'Western' },
  'ntungamo': { name: 'Ntungamo Municipality', lat: -0.8794, lng: 30.2642, region: 'Western' },
  'rukungiri': { name: 'Rukungiri Municipality', lat: -0.8411, lng: 29.9419, region: 'Western' },
  'kisoro': { name: 'Kisoro Municipality (Gorilla Highlands)', lat: -1.2853, lng: 29.6850, region: 'Western' },
  'bundibugyo': { name: 'Bundibugyo Town', lat: 0.7108, lng: 30.0636, region: 'Western' },
  'kyenjojo': { name: 'Kyenjojo Town', lat: 0.6092, lng: 30.6214, region: 'Western' },
  'kamwenge': { name: 'Kamwenge Town', lat: 0.1867, lng: 30.4533, region: 'Western' },
  'ibanda': { name: 'Ibanda Municipality', lat: -0.1339, lng: 30.4967, region: 'Western' },
  'kiruhura': { name: 'Kiruhura / Rushere', lat: -0.2100, lng: 30.8200, region: 'Western' },
  'rushere': { name: 'Rushere, Kiruhura', lat: -0.2100, lng: 30.8200, region: 'Western' },
  'isingiro': { name: 'Isingiro Town', lat: -0.8433, lng: 30.8033, region: 'Western' },
  'kibaale': { name: 'Kibaale Town', lat: 0.7981, lng: 31.0747, region: 'Western' },
  'kagadi': { name: 'Kagadi Town', lat: 0.9414, lng: 30.8122, region: 'Western' },
  'kakumiro': { name: 'Kakumiro Town', lat: 0.7800, lng: 31.3200, region: 'Western' },
  'kyegegwa': { name: 'Kyegegwa Town', lat: 0.4817, lng: 31.0567, region: 'Western' },
  'kanungu': { name: 'Kanungu Town', lat: -0.9575, lng: 29.7897, region: 'Western' },
  'buliisa': { name: 'Buliisa Town', lat: 2.0117, lng: 31.4133, region: 'Western' },
  'sheema': { name: 'Sheema / Kabwohe', lat: -0.5750, lng: 30.3800, region: 'Western' },
  'mitooma': { name: 'Mitooma Town', lat: -0.6133, lng: 30.0167, region: 'Western' },
  'rubirizi': { name: 'Rubirizi Town', lat: -0.2667, lng: 30.1000, region: 'Western' },

  // =========================================================================
  // NORTHERN REGION — Acholi, Lango, West Nile & Karamoja
  // =========================================================================
  'gulu': { name: 'Gulu City', lat: 2.7747, lng: 32.2990, region: 'Northern' },
  'lira': { name: 'Lira City', lat: 2.2472, lng: 32.8997, region: 'Northern' },
  'arua': { name: 'Arua City (West Nile Hub)', lat: 3.0303, lng: 30.9108, region: 'Northern' },
  'kitgum': { name: 'Kitgum Municipality', lat: 3.2783, lng: 32.8867, region: 'Northern' },
  'moroto': { name: 'Moroto Municipality (Karamoja)', lat: 2.5344, lng: 34.6667, region: 'Northern' },
  'kotido': { name: 'Kotido Municipality', lat: 2.9806, lng: 34.1331, region: 'Northern' },
  'nebbi': { name: 'Nebbi Municipality', lat: 2.4783, lng: 31.0889, region: 'Northern' },
  'koboko': { name: 'Koboko Municipality', lat: 3.4144, lng: 30.9600, region: 'Northern' },
  'yumbe': { name: 'Yumbe Town', lat: 3.4650, lng: 31.2467, region: 'Northern' },
  'moyo': { name: 'Moyo Town', lat: 3.6608, lng: 31.7247, region: 'Northern' },
  'adjumani': { name: 'Adjumani Town', lat: 3.3778, lng: 31.7908, region: 'Northern' },
  'apac': { name: 'Apac Municipality', lat: 1.9756, lng: 31.9756, region: 'Northern' },
  'dokolo': { name: 'Dokolo Town', lat: 1.9189, lng: 33.1783, region: 'Northern' },
  'oyam': { name: 'Oyam Town', lat: 2.3814, lng: 32.5008, region: 'Northern' },
  'pader': { name: 'Pader Town', lat: 2.8278, lng: 33.0033, region: 'Northern' },
  'agago': { name: 'Agago Town', lat: 2.8333, lng: 33.3333, region: 'Northern' },
  'abim': { name: 'Abim Town', lat: 2.7000, lng: 33.6667, region: 'Northern' },
  'kaabong': { name: 'Kaabong Town', lat: 3.5133, lng: 34.1206, region: 'Northern' },
  'amuru': { name: 'Amuru Town', lat: 2.8189, lng: 31.8711, region: 'Northern' },
  'nwoya': { name: 'Nwoya / Anaka', lat: 2.6333, lng: 32.0000, region: 'Northern' },
  'maracha': { name: 'Maracha Town', lat: 3.2833, lng: 30.9333, region: 'Northern' },
  'zombo': { name: 'Zombo / Paidha', lat: 2.5167, lng: 30.9000, region: 'Northern' },
  'paidha': { name: 'Paidha Town, Zombo', lat: 2.4167, lng: 30.9833, region: 'Northern' },
  'nakapiripirit': { name: 'Nakapiripirit Town', lat: 1.9167, lng: 34.7167, region: 'Northern' },
  'amudat': { name: 'Amudat Town', lat: 1.9500, lng: 34.9333, region: 'Northern' },
  'kole': { name: 'Kole Town', lat: 2.3833, lng: 32.7833, region: 'Northern' },
  'alebtong': { name: 'Alebtong Town', lat: 2.3000, lng: 33.3000, region: 'Northern' },
  'otuke': { name: 'Otuke Town', lat: 2.4833, lng: 33.5000, region: 'Northern' },
  'lamwo': { name: 'Lamwo Town', lat: 3.5333, lng: 32.5333, region: 'Northern' }
};

// Aliases for backwards compatibility with earlier Kampala-only code
const KAMPALA_LANDMARKS = UGANDA_LOCATIONS;

/**
 * Intelligent location matching: searches all Ugandan cities, municipalities,
 * towns, districts, landmarks, and aliases across the country.
 */
function findClosestUgandaLocation(text) {
  if (!text) return null;
  const clean = text.toLowerCase().trim();

  // 1. Direct key equality or starts with
  if (UGANDA_LOCATIONS[clean]) {
    return UGANDA_LOCATIONS[clean];
  }

  // 2. Tokenized search: check if user typed e.g. "Mbarara Town", "Gulu City", "Entebbe Airport"
  // Prioritize longer keys first (e.g. "fort portal" before "portal")
  const sortedKeys = Object.keys(UGANDA_LOCATIONS).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    // Regex word boundary matching or clean substring containment
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(clean) || clean.includes(key)) {
      return UGANDA_LOCATIONS[key];
    }
  }

  return null;
}

/**
 * Calculates accurate road distance (km) on roads based on Central Region of Uganda.
 * Uses Haversine great-circle formula combined with calibrated road network factors
 * matching the Central Region road corridors (UNRA Central Network):
 * - Greater Kampala Metropolitan & Urban Streets (<= 15 km): 1.38x
 * - Central Regional Arterials (Entebbe Expressway, Jinja Rd, Masaka Rd, 15 - 50 km): 1.32x
 * - Greater Central Highways (> 50 km, e.g. Masaka, Luweero, Mityana, Mubende): 1.28x
 */
function calculateCentralUgandaDistance(loc1Str, loc2Str) {
  const p1 = findClosestUgandaLocation(loc1Str);
  const p2 = findClosestUgandaLocation(loc2Str);

  if (p1 && p2) {
    // Exact same town / neighborhood
    if (p1.name === p2.name) {
      return 2.5; // Minimum local delivery within same neighborhood/town
    }

    const R = 6371; // Earth radius in km
    const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
    const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightDistance = R * c;

    // Apply Central Region road network factor
    let roadFactor = 1.38; // Default urban grid
    if (straightDistance > 50) {
      roadFactor = 1.28; // Major highway corridor
    } else if (straightDistance > 15) {
      roadFactor = 1.32; // Inter-district regional arterial
    }

    const roadDistance = straightDistance * roadFactor;
    return Math.max(2.0, Math.round(roadDistance * 10) / 10);
  }

  // Fallback for custom unmapped addresses in Central Region
  const clean1 = (loc1Str || '').toLowerCase();
  const clean2 = (loc2Str || '').toLowerCase();

  // If both are recognized to be in the same metropolitan area
  if (clean1.includes('kampala') && clean2.includes('kampala')) {
    return 6.5;
  }

  // Cross-district default estimate in Central Region
  return 18.0;
}

// Backward-compatible aliases
const calculateUgandaDistance = calculateCentralUgandaDistance;
const calculateKampalaDistance = calculateCentralUgandaDistance;

/**
 * Fetch active pricing rules from database
 */
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
        small_parcel: 0,
        medium_box: 0,
        large_package: 0,
        groceries: 0,
        fragile: 0
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

/**
 * DYNAMIC CENTRAL REGION ROAD RATE CALCULATION ENGINE:
 * Calculates delivery quote dynamically on roads based on Central Region of Uganda.
 * Dynamic road rate is 800 UGX per 1 km (e.g. 5 km = 4,000 UGX, 10 km = 8,000 UGX, 46.2 km = 36,960 UGX).
 * Package size/category surcharge is zeroed (0 UGX) so rates are purely and transparently
 * driven by dynamic road distance on Central Region roads.
 */
function calculateDeliveryQuote({ pickup, destination, category = 'small_parcel', is_urgent = false, custom_km = null }) {
  const rules = getActivePricingRules();

  // Calculate road distance across Central Region of Uganda
  const distance_km = custom_km != null && !isNaN(parseFloat(custom_km))
    ? Math.max(1.0, parseFloat(custom_km))
    : calculateCentralUgandaDistance(pickup, destination);

  const base_fee = rules.base_fee;
  const per_km = rules.per_km_rate || 800; // 800 UGX per 1 km

  // Dynamic road distance fee: exactly 800 UGX per 1 km
  const distance_fee = Math.round(distance_km * per_km);

  // Package size surcharge is 0 (rates are purely distance-driven on Central Region roads)
  const category_fee = 0;

  // Urgent express surcharge
  const urgent_fee = is_urgent ? rules.urgent_surcharge : 0;

  // Raw total & enforce minimum fee rounded to nearest 500 UGX
  const raw_total = base_fee + distance_fee + category_fee + urgent_fee;
  const total_fee = Math.max(rules.min_fee, Math.round(raw_total / 500) * 500);

  const p1 = findClosestUgandaLocation(pickup);
  const p2 = findClosestUgandaLocation(destination);

  let route_type = 'Central Metropolitan Route';
  if (distance_km > 50) {
    route_type = 'Greater Central Highway Corridor';
  } else if (distance_km > 15) {
    route_type = 'Central Inter-District Corridor';
  }

  return {
    distance_km,
    rate_per_km: per_km,
    route_type,
    coverage: 'Central Region of Uganda Road Network',
    origin: p1 ? p1.name : (pickup || 'Origin in Central Uganda'),
    origin_region: p1 ? p1.region : 'Central',
    destination_name: p2 ? p2.name : (destination || 'Destination in Central Uganda'),
    destination_region: p2 ? p2.region : 'Central',
    base_fee,
    per_km_rate: per_km,
    distance_fee,
    category,
    category_fee: 0,
    is_urgent: !!is_urgent,
    urgent_fee,
    min_fee: rules.min_fee,
    total_fee,
    currency: 'UGX'
  };
}

/**
 * Update pricing rules (Super Admin only)
 */
function updatePricingRules({ base_fee, per_km_rate, min_fee, urgent_surcharge, category_surcharges }) {
  const categoryStr = typeof category_surcharges === 'object'
    ? JSON.stringify(category_surcharges)
    : category_surcharges;

  db.prepare(`
    UPDATE pricing_rules
    SET base_fee = ?, per_km_rate = ?, min_fee = ?, urgent_surcharge = ?, category_surcharges = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM pricing_rules ORDER BY id DESC LIMIT 1)
  `).run(
    Number(base_fee),
    Number(per_km_rate),
    Number(min_fee),
    Number(urgent_surcharge),
    categoryStr || '{"document":0,"small_parcel":0,"medium_box":0,"large_package":0,"groceries":0,"fragile":0}'
  );

  return getActivePricingRules();
}

module.exports = {
  UGANDA_LOCATIONS,
  KAMPALA_LANDMARKS: UGANDA_LOCATIONS,
  findClosestUgandaLocation,
  findClosestLandmark: findClosestUgandaLocation,
  calculateCentralUgandaDistance,
  calculateUgandaDistance,
  calculateKampalaDistance,
  getActivePricingRules,
  calculateDeliveryQuote,
  updatePricingRules
};
