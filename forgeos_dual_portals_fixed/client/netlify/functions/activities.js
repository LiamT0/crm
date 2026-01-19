// Netlify Function: activities
// Stores CRM activity logs in Neon (optional, next step)
//
// ENV:
//   DATABASE_URL
//
// Endpoints:
//   GET  /.netlify/functions/activities?limit=100
//   POST /.netlify/functions/activities

const { neon } = require('@neondatabase/serverless');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
      const limit = Math.min(500, Number(event.queryStringParameters?.limit || 200));
      const rows = await sql`
        SELECT * FROM activities
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const p = JSON.parse(event.body || '{}');
      const rows = await sql`
        INSERT INTO activities (text, meta)
        VALUES (${p.text || ''}, ${p.meta || null})
        RETURNING *
      `;
      return json(200, rows[0]);
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || String(e) });
  }
};
