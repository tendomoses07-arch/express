/**
 * KOLA EXPRESS - LIVE MAPPING, GEOCODING & ROAD ROUTING SERVICE
 * Integrates OpenStreetMap Nominatim and OSRM (Open Source Routing Machine)
 * for live address resolution, coordinates, actual road distance, and ETA across Uganda.
 */

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
 * Format address display details from Nominatim item
 */
function formatCandidate(item, idx) {
  const addr = item.address || {};
  const suburb = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || addr.village || '';
  const town = addr.town || addr.city || addr.municipality || addr.county || '';
  const district = addr.state_district || addr.district || addr.state || '';
  const road = addr.road || addr.pedestrian || addr.footway || '';

  // Short descriptive title
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
    category: item.class
  };
}

/**
 * Geocode a user-written address using Nominatim (Uganda-focused)
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

  try {
    // 1. Query OpenStreetMap Nominatim restricted to Uganda (countrycodes=ug)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&countrycodes=ug&limit=5&addressdetails=1`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KolaExpress-DeliveryApp/2.0 (dispatch@kolaexpress.ug; support@kolaexpress.ug)'
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status} ${response.statusText}`);
    }

    const results = await response.json();

    // CASE A: No Nominatim matches
    if (!results || results.length === 0) {
      // Fallback: Check internal verified Uganda landmark index
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

    // CASE B: Exactly 1 result found -> unambiguous
    if (results.length === 1) {
      const top = formatCandidate(results[0], 0);
      const result = {
        resolved: true,
        is_ambiguous: false,
        source: 'nominatim_live',
        location: top
      };
      setCache(geocodeCache, cacheKey, result);
      return result;
    }

    // CASE C: Multiple results found -> evaluate ambiguity
    const candidates = results.map((item, idx) => formatCandidate(item, idx));

    // Check if candidates are in distinctly different districts or far apart (> 4 km)
    let isDistinct = false;
    const firstLat = candidates[0].lat;
    const firstLng = candidates[0].lng;

    for (let i = 1; i < candidates.length; i++) {
      const dLat = (candidates[i].lat - firstLat) * 111;
      const dLng = (candidates[i].lng - firstLng) * 111 * Math.cos(firstLat * (Math.PI / 180));
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distKm > 3.5 || candidates[i].district !== candidates[0].district) {
        isDistinct = true;
        break;
      }
    }

    // If query is short or generic (e.g., "Market", "School", "Church", "Stage", "Plaza")
    const isGenericTerm = /^(market|church|school|hospital|plaza|mall|stage|petrol|station|bank|hotel|mosque|centre|center|clinic|arcade)$/i.test(cleanQuery.trim());

    if (isDistinct || isGenericTerm) {
      // Ambiguous location! Ask customer to clarify
      const result = {
        resolved: false,
        is_ambiguous: true,
        query: cleanQuery,
        message: `Multiple locations match "${cleanQuery}". Please tap your exact location below:`,
        candidates: candidates.slice(0, 4)
      };
      // Do not cache ambiguous prompts long-term
      return result;
    }

    // Otherwise, top candidate is a strong match within the same cluster
    const top = candidates[0];
    const result = {
      resolved: true,
      is_ambiguous: false,
      source: 'nominatim_live',
      location: top
    };
    setCache(geocodeCache, cacheKey, result);
    return result;

  } catch (err) {
    console.warn(`[Geocoding Service Warning] Live geocode failed for "${cleanQuery}":`, err.message);

    // Fallback to internal location database
    const localMatch = findClosestUgandaLocation(cleanQuery);
    if (localMatch) {
      return {
        resolved: true,
        is_ambiguous: false,
        source: 'local_fallback',
        location: {
          title: localMatch.name,
          display_name: `${localMatch.name}, ${localMatch.district || 'Uganda'}, Central Region, Uganda`,
          lat: localMatch.lat,
          lng: localMatch.lng,
          district: localMatch.district || 'Kampala / Wakiso',
          region: localMatch.region || 'Central'
        }
      };
    }

    return {
      resolved: false,
      is_ambiguous: false,
      not_found: true,
      message: `Unable to verify address "${cleanQuery}". Please type with your nearby town or landmark (e.g. Ntinda, Entebbe, Bugolobi).`
    };
  }
}

/**
 * Calculate actual road distance (km) and driving ETA (minutes) using OSRM
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

  try {
    // OSRM format: /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=false
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

        let eta_text = `${duration_minutes} mins`;
        if (duration_minutes >= 60) {
          const hours = Math.floor(duration_minutes / 60);
          const mins = duration_minutes % 60;
          eta_text = mins > 0 ? `${hours}h ${mins}m` : `${hours} hrs`;
        }

        const result = {
          success: true,
          source: 'osrm_live',
          distance_km,
          duration_minutes,
          eta_text
        };
        setCache(routeCache, cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn(`[Routing Service Warning] Live OSRM route failed:`, err.message);
  }

  // Graceful Fallback: Haversine distance with Kampala/Wakiso urban road tortuosity
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

  // Urban traffic speed approximation: 26 km/h in metro
  const duration_minutes = Math.max(15, Math.round((distance_km / 26) * 60));
  const eta_text = duration_minutes >= 60
    ? `${Math.floor(duration_minutes / 60)}h ${duration_minutes % 60}m`
    : `${duration_minutes} mins`;

  const fallbackResult = {
    success: true,
    source: 'haversine_road_model',
    distance_km,
    duration_minutes,
    eta_text
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
  geocodeAddress,
  getRoadRoute,
  searchAddressSuggestions
};
