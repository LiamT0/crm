// Netlify Function: /.../companies
// Minimal Neon-backed Companies API for ForgeOS CRM
//
// ENV REQUIRED on Netlify:
//   DATABASE_URL = <Neon connection string>
//
// Endpoints:
//   GET    /.netlify/functions/companies?limit=100
//   GET    /.netlify/functions/companies?id=<uuid>
//   POST   /.netlify/functions/companies
//   PATCH  /.netlify/functions/companies?id=<uuid>

const { neon } = require('@neondatabase/serverless');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return json(500, { error: 'Missing DATABASE_URL env var' });
  const sql = neon(dbUrl);

  try {
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.id;
      const limit = Math.min(500, Number(event.queryStringParameters?.limit || 200));
      if (id) {
        const rows = await sql`
          SELECT * FROM companies
          WHERE id = ${id}
          LIMIT 1
        `;
        return json(200, rows?.[0] || null);
      }
      const rows = await sql`
        SELECT * FROM companies
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const rows = await sql`
        INSERT INTO companies (
          name, status, phone, website, address, lat, lng,
          rating, reviews, external_place_id,
          portal_email, billing_email
        ) VALUES (
          ${payload.name || ''},
          ${payload.status || 'unknown'},
          ${payload.phone || null},
          ${payload.website || null},
          ${payload.address || null},
          ${payload.lat ?? null},
          ${payload.lng ?? null},
          ${payload.rating ?? null},
          ${payload.reviews ?? null},
          ${payload.external_place_id || null},
          ${payload.portal_email || null},
          ${payload.billing_email || null}
        )
        ON CONFLICT (external_place_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          phone = EXCLUDED.phone,
          website = EXCLUDED.website,
          address = EXCLUDED.address,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          rating = EXCLUDED.rating,
          reviews = EXCLUDED.reviews,
          portal_email = COALESCE(EXCLUDED.portal_email, companies.portal_email),
          billing_email = COALESCE(EXCLUDED.billing_email, companies.billing_email),
          updated_at = NOW()
        RETURNING *
      `;
      return json(200, rows[0]);
    }

    if (event.httpMethod === 'PATCH') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      const payload = JSON.parse(event.body || '{}');

      // Only allow a few fields for now
      const rows = await sql`
        UPDATE companies
        SET
          status = COALESCE(${payload.status || null}, status),
          phone = COALESCE(${payload.phone || null}, phone),
          website = COALESCE(${payload.website || null}, website),
          address = COALESCE(${payload.address || null}, address),
          portal_email = COALESCE(${payload.portal_email || null}, portal_email),
          billing_email = COALESCE(${payload.billing_email || null}, billing_email),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return json(200, rows[0] || null);
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || String(e) });
  }
};
