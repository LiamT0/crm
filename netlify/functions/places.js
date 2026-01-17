// Netlify Function: /.netlify/functions/places
// Purpose: Accept keyword + location text and return enriched local business leads using Google APIs.
// Requires env var: GOOGLE_PLACES_API_KEY
// Optional env var: GOOGLE_PLACES_DETAILS_LIMIT (default 10)

const DEFAULT_LIMIT = 20;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  return { res, data };
}

function milesToMeters(miles) {
  const m = Number(miles);
  if (!Number.isFinite(m)) return 1609 * 10;
  return Math.min(Math.max(m, 1), 50) * 1609.34;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'Missing GOOGLE_PLACES_API_KEY env var' });
  }

  const params = event.queryStringParameters || {};
  const keyword = (params.keyword || '').trim();
  const locationText = (params.location || '').trim();
  const radiusMiles = params.radius || '10';
  const limit = Math.min(Math.max(Number(params.limit || DEFAULT_LIMIT), 5), 50);

  if (!keyword) return json(400, { error: 'Missing keyword' });
  if (!locationText) return json(400, { error: 'Missing location' });

  try {
    // 1) Geocode the text location into lat/lng
    const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    geocodeUrl.searchParams.set('address', locationText);
    geocodeUrl.searchParams.set('key', apiKey);

    const { data: geo } = await fetchJson(geocodeUrl.toString());
    if (geo.status !== 'OK' || !geo.results?.length) {
      return json(400, { error: 'Geocode failed', status: geo.status, location: locationText });
    }
    const loc = geo.results[0].geometry.location;

    // 2) Nearby search for businesses matching the keyword
    const nearbyUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    nearbyUrl.searchParams.set('location', `${loc.lat},${loc.lng}`);
    nearbyUrl.searchParams.set('radius', String(milesToMeters(radiusMiles)));
    nearbyUrl.searchParams.set('keyword', keyword);
    nearbyUrl.searchParams.set('key', apiKey);

    const { data: near } = await fetchJson(nearbyUrl.toString());
    if (near.status !== 'OK' && near.status !== 'ZERO_RESULTS') {
      return json(500, { error: 'Nearby search failed', status: near.status, message: near.error_message });
    }

    const results = (near.results || []).slice(0, limit);

    // 3) Enrich with phone + website (Details API)
    const detailsLimit = Math.min(
      Math.max(Number(process.env.GOOGLE_PLACES_DETAILS_LIMIT || '10'), 0),
      25
    );

    const enriched = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const base = {
        place_id: r.place_id,
        name: r.name,
        address: r.vicinity || r.formatted_address || '',
        rating: r.rating ?? null,
        user_ratings_total: r.user_ratings_total ?? 0,
        lat: r.geometry?.location?.lat ?? null,
        lng: r.geometry?.location?.lng ?? null,
        website: '',
        phone: '',
      };

      if (i < detailsLimit) {
        const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        detailsUrl.searchParams.set('place_id', r.place_id);
        detailsUrl.searchParams.set('fields', 'formatted_phone_number,website');
        detailsUrl.searchParams.set('key', apiKey);

        const { data: det } = await fetchJson(detailsUrl.toString());
        if (det.status === 'OK') {
          base.website = det.result?.website || '';
          base.phone = det.result?.formatted_phone_number || '';
        }
      }

      enriched.push(base);
    }

    return json(200, { center: loc, leads: enriched });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Server error', message: err?.message || String(err) });
  }
};
