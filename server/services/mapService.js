/**
 * KOLA EXPRESS - MAPBOX LIVE MAPPING & ROUTING SERVICE
 * Sole and authoritative mapping system for Kola Express.
 * All geocoding, address autocomplete, driving routing, road distance (km),
 * and ETA calculations are performed strictly via Mapbox APIs.
 */

require('dotenv').config();

// In-memory cache to optimize performance and prevent rate-limiting
const geocodeCache = new Map();
const routeCache = new Map();
const CACHE_MAX = 500;

function setCache(cacheMap, key, value) {
  if (cacheMap.size >= CACHE_MAX) {
    const firstKey = cacheMap.keys().next().value;
    cacheMap.delete(firstKey);
  }
  cacheMap.set(key, value);
}

/**
 * Retrieve active Mapbox Access Token from environment
 */
function getMapboxToken() {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || null;
  return token && token.trim().length > 0 ? token.trim() : null;
}

/**
 * Format minutes into clean human-readable ETA
 */
function formatEta(durationMinutes) {
  if (durationMinutes >= 60) {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hrs`;
  }
  return `${durationMinutes} mins`;
}

/**
 * Format Mapbox Feature into standardized candidate object
 */
function formatMapboxFeature(feature, idx) {
  const context = feature.context || [];
  
  let district = '';
  let region = 'Central';
  let locality = '';

  for (const c of context) {
    if (c.id && c.id.startsWith('district')) {
      district = c.text;
    } else if (c.id && c.id.startsWith('region')) {
      region = c.text;
    } else if (c.id && (c.id.startsWith('place') || c.id.startsWith('locality') || c.id.startsWith('neighborhood'))) {
      locality = c.text;
    }
  }

  // Short descriptive title
  const shortTitle = feature.text || (feature.place_name ? feature.place_name.split(',')[0].trim() : 'Location');
  const lat = parseFloat(feature.center[1]);
  const lng = parseFloat(feature.center[0]);

  const areaDesc = [locality, district, region].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

  return {
    candidate_id: idx,
    title: shortTitle,
    display_name: feature.place_name || shortTitle,
    area_description: areaDesc || feature.place_name || shortTitle,
    lat,
    lng,
    city: locality,
    district: district || 'Uganda',
    region,
    provider: 'mapbox'
  };
}

/**
 * Evaluates whether multiple Mapbox candidates represent ambiguous locations
 */
function evaluateAmbiguity(candidates, cleanQuery) {
  if (candidates.length <= 1) return false;

  const firstLat = candidates[0].lat;
  const firstLng = candidates[0].lng;
  let isDistinct = false;

  for (let i = 1; i < candidates.length; i++) {
    const dLat = (candidates[i].lat - firstLat) * 111;
    const dLng = (candidates[i].lng - firstLng) * 111 * Math.cos(firstLat * (Math.PI / 180));
    const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
    if (distKm > 3.5 || (candidates[i].district && candidates[0].district && candidates[i].district !== candidates[0].district)) {
      isDistinct = true;
      break;
    }
  }

  const isGenericTerm = /^(market|church|school|hospital|plaza|mall|stage|petrol|station|bank|hotel|mosque|centre|center|clinic|arcade)$/i.test(cleanQuery.trim());
  return isDistinct || isGenericTerm;
}

/**
 * Geocode a user-written address using Mapbox Geocoding API v5
 */
async function geocodeAddress(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return {
      resolved: false,
      is_ambiguous: false,
      not_found: true,
      message: 'Address cannot be empty. Please enter an address or landmark.'
    };
  }

  const cleanQuery = rawQuery.trim();
  const cacheKey = cleanQuery.toLowerCase();

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const token = getMapboxToken();
  if (!token) {
    return {
      resolved: false,
      is_ambiguous: false,
      error: true,
      message: 'Mapbox Access Token is required. Please set MAPBOX_ACCESS_TOKEN in your .env file.'
    };
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?access_token=${token}&country=ug&proximity=32.5825,0.3476&types=poi,address,neighborhood,locality,place,district&limit=5`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KolaExpress-DeliveryApp/2.0'
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          resolved: false,
          is_ambiguous: false,
          error: true,
          message: 'Invalid or unauthorized Mapbox Access Token. Please verify MAPBOX_ACCESS_TOKEN in your .env file.'
        };
      }
      throw new Error(`Mapbox geocoding error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const features = data.features || [];

    if (features.length === 0) {
      return {
        resolved: false,
        is_ambiguous: false,
        not_found: true,
        message: `Mapbox could not pinpoint "${cleanQuery}". Please specify a nearby street, town, or landmark in Uganda.`
      };
    }

    const candidates = features.map((f, idx) => formatMapboxFeature(f, idx));

    if (evaluateAmbiguity(candidates, cleanQuery)) {
      return {
        resolved: false,
        is_ambiguous: true,
        query: cleanQuery,
        provider: 'mapbox',
        message: `Multiple locations match "${cleanQuery}". Please select your exact location below:`,
        candidates: candidates.slice(0, 4)
      };
    }

    const top = candidates[0];
    const result = {
      resolved: true,
      is_ambiguous: false,
      source: 'Mapbox Geocoding v5',
      provider: 'mapbox',
      location: top
    };
    setCache(geocodeCache, cacheKey, result);
    return result;

  } catch (err) {
    return {
      resolved: false,
      is_ambiguous: false,
      error: true,
      message: `Mapbox geocoding request failed: ${err.message}`
    };
  }
}

/**
 * Calculate actual road distance (km) and driving ETA (minutes) strictly via Mapbox Directions API v5
 */
async function getRoadRoute(originCoords, destCoords) {
  const oLat = parseFloat(originCoords.lat);
  const oLng = parseFloat(originCoords.lng || originCoords.lon);
  const dLat = parseFloat(destCoords.lat);
  const dLng = parseFloat(destCoords.lng || destCoords.lon);

  if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
    throw new Error('Invalid coordinates provided for Mapbox route calculation');
  }

  const cacheKey = `${oLat.toFixed(4)},${oLng.toFixed(4)}_${dLat.toFixed(4)},${dLng.toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const token = getMapboxToken();
  if (!token) {
    throw new Error('Mapbox Access Token is required. Please set MAPBOX_ACCESS_TOKEN in your .env file.');
  }

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${oLng},${oLat};${dLng},${dLat}?access_token=${token}&overview=simplified&geometries=geojson`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'KolaExpress-DeliveryApp/2.0'
    }
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid or unauthorized Mapbox Access Token for driving directions.');
    }
    throw new Error(`Mapbox directions error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
    const route = data.routes[0];
    const distance_km = Math.max(1.5, Math.round((route.distance / 1000) * 10) / 10);
    const duration_minutes = Math.max(10, Math.round(route.duration / 60));

    const result = {
      success: true,
      source: 'Mapbox Directions API (Driving)',
      provider: 'mapbox',
      distance_km,
      duration_minutes,
      eta_text: formatEta(duration_minutes),
      geometry: route.geometry
    };
    setCache(routeCache, cacheKey, result);
    return result;
  }

  throw new Error('No driving route found in Mapbox response');
}

/**
 * Autocomplete suggestions strictly via Mapbox Geocoding API v5
 */
async function searchAddressSuggestions(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return [];
  }

  const cleanQuery = query.trim();
  const token = getMapboxToken();
  if (!token) {
    return [];
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?access_token=${token}&country=ug&proximity=32.5825,0.3476&autocomplete=true&limit=6`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const features = data.features || [];
      return features.map((f, idx) => formatMapboxFeature(f, idx));
    }
  } catch (err) {
    // Return empty on suggestion error
  }

  return [];
}

module.exports = {
  getMapboxToken,
  geocodeAddress,
  getRoadRoute,
  searchAddressSuggestions,
  formatEta
};
