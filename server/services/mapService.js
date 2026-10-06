/**
 * KOLA EXPRESS - LIVE MAPPING, GEOCODING & ROAD ROUTING SERVICE
 * Native Mapbox Integration with OpenStreetMap / OSRM Resilient Fallback.
 * Resolves user-written pickup and drop-off addresses, coordinates, actual
 * road driving distance (km), and ETA (mins) across Uganda.
 */

require('dotenv').config();
const { UGANDA_LOCATIONS, findClosestUgandaLocation } = require('../pricing');

// In-memory cache to prevent redundant external API calls and rate-limiting
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
 * Current active mapping provider indicator
 */
function getMapProvider() {
  return getMapboxToken() ? 'mapbox' : 'live_osm';
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
 * Format address display details from Nominatim item
 */
function formatCandidate(item, idx) {
  const addr = item.address || {};
  const suburb = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || addr.village || '';
  const town = addr.town || addr.city || addr.municipality || addr.county || '';
  const district = addr.state_district || addr.district || addr.state || '';
  const road = addr.road || addr.pedestrian || addr.footway || '';

  let shortTitle = item.name || '';
  if (!shortTitle) {
    const parts = item.display_name.split(',');
    shortTitle = parts.slice(0, 2).join(',').trim();
  }

  const areaDesc = [road, suburb, town, district].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

  return {
    candidate_id: idx,
    title: shortTitle,
    display_name: item.display_name,
    area_description: areaDesc || item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    suburb,
    city: town,
    district: district || 'Uganda',
    type: item.type,
    category: item.class,
    provider: 'osm'
  };
}

/**
 * Mapbox Geocoding API v5 Query (Restricted to Uganda, proximity around Kampala)
 */
async function geocodeWithMapbox(cleanQuery, token) {
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
    throw new Error(`Mapbox geocoding error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.features || [];
}

/**
 * Mapbox Directions API v5 Query (Driving road network)
 */
async function getRouteWithMapbox(originCoords, destCoords, token) {
  const oLng = parseFloat(originCoords.lng || originCoords.lon);
  const oLat = parseFloat(originCoords.lat);
  const dLng = parseFloat(destCoords.lng || destCoords.lon);
  const dLat = parseFloat(destCoords.lat);

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
    throw new Error(`Mapbox directions error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
    const route = data.routes[0];
    const distance_km = Math.max(1.5, Math.round((route.distance / 1000) * 10) / 10);
    const duration_minutes = Math.max(10, Math.round(route.duration / 60));
    return {
      distance_km,
      duration_minutes,
      eta_text: formatEta(duration_minutes),
      geometry: route.geometry,
      source: 'Mapbox Directions API (Driving)'
    };
  }
  throw new Error('No driving route found in Mapbox response');
}

/**
 * Mapbox Address Autocomplete Query
 */
async function searchSuggestionsWithMapbox(cleanQuery, token) {
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
  return [];
}

/**
 * Evaluates whether multiple candidates represent ambiguous locations
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
 * Geocode a user-written address using Mapbox (with fallback to Nominatim & local gazetteer)
 * Detects ambiguity if multiple distinct locations are found.
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

  const mapboxToken = getMapboxToken();

  // 1. Try Mapbox Geocoding v5 if token is configured
  if (mapboxToken) {
    try {
      const features = await geocodeWithMapbox(cleanQuery, mapboxToken);
      if (features && features.length > 0) {
        const candidates = features.map((f, idx) => formatMapboxFeature(f, idx));

        if (evaluateAmbiguity(candidates, cleanQuery)) {
          return {
            resolved: false,
            is_ambiguous: true,
            query: cleanQuery,
            provider: 'mapbox',
            message: `Multiple locations match "${cleanQuery}". Please tap your exact location below:`,
            candidates: candidates.slice(0, 4)
          };
        }

        const top = candidates[0];
        const result = {
          resolved: true,
          is_ambiguous: false,
          source: 'mapbox_geocoding_v5',
          provider: 'mapbox',
          location: top
        };
        setCache(geocodeCache, cacheKey, result);
        return result;
      }
    } catch (mapboxErr) {
      console.warn(`[Mapbox Geocoding] Live Mapbox lookup for "${cleanQuery}" failed (${mapboxErr.message}). Engaging fallback.`);
    }
  }

  // 2. OpenStreetMap Nominatim Fallback (restricted to Uganda)
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&countrycodes=ug&limit=5&addressdetails=1`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KolaExpress-DeliveryApp/2.0 (dispatch@kolaexpress.ug)'
      }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const results = await response.json();

      if (results && results.length > 0) {
        const candidates = results.map((item, idx) => formatCandidate(item, idx));

        if (evaluateAmbiguity(candidates, cleanQuery)) {
          return {
            resolved: false,
            is_ambiguous: true,
            query: cleanQuery,
            provider: 'osm',
            message: `Multiple locations match "${cleanQuery}". Please tap your exact location below:`,
            candidates: candidates.slice(0, 4)
          };
        }

        const top = candidates[0];
        const result = {
          resolved: true,
          is_ambiguous: false,
          source: 'nominatim_live',
          provider: 'osm',
          location: top
        };
        setCache(geocodeCache, cacheKey, result);
        return result;
      }
    }
  } catch (osmErr) {
    console.warn(`[OSM Geocoding] Live Nominatim lookup for "${cleanQuery}" failed (${osmErr.message}).`);
  }

  // 3. Fallback: Internal verified Uganda landmark index
  const localMatch = findClosestUgandaLocation(cleanQuery);
  if (localMatch) {
    const result = {
      resolved: true,
      is_ambiguous: false,
      source: 'local_verified_index',
      location: {
        title: localMatch.name,
        display_name: `${localMatch.name}, ${localMatch.district || 'Uganda'}, Central Region, Uganda`,
        lat: localMatch.lat,
        lng: localMatch.lng,
        district: localMatch.district || 'Kampala / Wakiso',
        region: localMatch.region || 'Central'
      }
    };
    setCache(geocodeCache, cacheKey, result);
    return result;
  }

  return {
    resolved: false,
    is_ambiguous: false,
    not_found: true,
    message: `Could not pinpoint "${cleanQuery}". Please include your street name, nearby building, suburb or town (e.g. "Acacia Mall, Kisementi" or "Ntinda Complex").`
  };
}

/**
 * Calculate actual road distance (km) and driving ETA (minutes) using Mapbox Directions
 * (with resilient fallback to live OSRM and urban road model)
 */
async function getRoadRoute(originCoords, destCoords) {
  const oLat = parseFloat(originCoords.lat);
  const oLng = parseFloat(originCoords.lng || originCoords.lon);
  const dLat = parseFloat(destCoords.lat);
  const dLng = parseFloat(destCoords.lng || destCoords.lon);

  if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
    throw new Error('Invalid coordinates provided for route calculation');
  }

  const cacheKey = `${oLat.toFixed(4)},${oLng.toFixed(4)}_${dLat.toFixed(4)},${dLng.toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const mapboxToken = getMapboxToken();

  // 1. Try Mapbox Directions v5 API if token is configured
  if (mapboxToken) {
    try {
      const mapboxRoute = await getRouteWithMapbox({ lat: oLat, lng: oLng }, { lat: dLat, lng: dLng }, mapboxToken);
      if (mapboxRoute && mapboxRoute.distance_km) {
        const result = {
          success: true,
          source: 'mapbox_directions_v5',
          provider: 'mapbox',
          distance_km: mapboxRoute.distance_km,
          duration_minutes: mapboxRoute.duration_minutes,
          eta_text: mapboxRoute.eta_text,
          geometry: mapboxRoute.geometry
        };
        setCache(routeCache, cacheKey, result);
        return result;
      }
    } catch (mapboxRouteErr) {
      console.warn(`[Mapbox Directions] Live route failed (${mapboxRouteErr.message}). Engaging fallback.`);
    }
  }

  // 2. Open Source Routing Machine (OSRM) driving network fallback
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=false`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KolaExpress-DeliveryApp/2.0'
      }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distance_km = Math.max(1.5, Math.round((route.distance / 1000) * 10) / 10);
        const duration_minutes = Math.max(10, Math.round(route.duration / 60));

        const result = {
          success: true,
          source: 'osrm_live',
          provider: 'osm',
          distance_km,
          duration_minutes,
          eta_text: formatEta(duration_minutes)
        };
        setCache(routeCache, cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn(`[OSRM Routing] Live OSRM route failed:`, err.message);
  }

  // 3. Fallback: Haversine distance with Kampala/Wakiso urban road tortuosity
  const R = 6371; // Earth radius in km
  const dLatRad = (dLat - oLat) * (Math.PI / 180);
  const dLonRad = (dLng - oLng) * (Math.PI / 180);
  const a =
    Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
    Math.cos(oLat * (Math.PI / 180)) * Math.cos(dLat * (Math.PI / 180)) *
    Math.sin(dLonRad / 2) * Math.sin(dLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistance = R * c;

  // Road factor: 1.32 for expressway (>20km), 1.38 for urban metro
  const roadFactor = straightDistance > 20 ? 1.32 : 1.38;
  const distance_km = Math.max(2.0, Math.round(straightDistance * roadFactor * 10) / 10);
  const duration_minutes = Math.max(15, Math.round((distance_km / 26) * 60));

  const fallbackResult = {
    success: true,
    source: 'haversine_road_model',
    provider: 'local_model',
    distance_km,
    duration_minutes,
    eta_text: formatEta(duration_minutes)
  };

  setCache(routeCache, cacheKey, fallbackResult);
  return fallbackResult;
}

/**
 * Autocomplete suggestions for real-time address search typing
 */
async function searchAddressSuggestions(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return [];
  }

  const cleanQuery = query.trim();
  const mapboxToken = getMapboxToken();

  // 1. Try Mapbox autocomplete if token is configured
  if (mapboxToken) {
    try {
      const suggestions = await searchSuggestionsWithMapbox(cleanQuery, mapboxToken);
      if (suggestions && suggestions.length > 0) {
        return suggestions;
      }
    } catch (err) {
      // Fallback
    }
  }

  // 2. Fallback to Nominatim autocomplete
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&countrycodes=ug&limit=5&addressdetails=1`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KolaExpress-DeliveryApp/2.0 (dispatch@kolaexpress.ug)'
      }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return (data || []).map((item, idx) => formatCandidate(item, idx));
    }
  } catch (err) {
    // Return empty on suggestion timeout
  }

  return [];
}

module.exports = {
  getMapboxToken,
  getMapProvider,
  geocodeWithMapbox,
  getRouteWithMapbox,
  searchSuggestionsWithMapbox,
  geocodeAddress,
  getRoadRoute,
  searchAddressSuggestions,
  formatEta
};
