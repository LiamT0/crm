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

    // 2) Places API (New): searchText (avoids legacy Nearby Search)
    const placesUrl = 'https://places.googleapis.com/v1/places:searchText';
    const body = {
      textQuery: `${keyword} in ${locationText}`,
      maxResultCount: limit,
      locationBias: {
        circle: {
          center: { latitude: loc.lat, longitude: loc.lng },
          radius: milesToMeters(radiusMiles),
        },
      },
    };

    const res = await fetch(placesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // Request only what we need so responses are fast + cheap
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return json(500, {
        error: 'Nearby search failed',
        status: data?.error?.status || res.status,
        message: data?.error?.message || JSON.stringify(data),
      });
    }

    const enriched = (data.places || []).map((p) => ({
      place_id: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      rating: p.rating ?? null,
      user_ratings_total: p.userRatingCount ?? 0,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      website: p.websiteUri || '',
      phone: p.nationalPhoneNumber || '',
    }));

    return json(200, { center: loc, leads: enriched });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Server error', message: err?.message || String(err) });
  }
};
