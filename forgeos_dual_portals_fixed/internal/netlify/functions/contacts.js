// Netlify Function: contacts
// Minimal Neon-backed Contacts API (optional, for next steps)
//
// ENV:
//   DATABASE_URL
//
// Endpoints:
//   GET   /.netlify/functions/contacts?company_id=<uuid>&limit=200
//   POST  /.netlify/functions/contacts

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
      const companyId = event.queryStringParameters?.company_id || null;
      const limit = Math.min(500, Number(event.queryStringParameters?.limit || 200));
      const rows = companyId
        ? await sql`
            SELECT * FROM contacts
            WHERE company_id = ${companyId}
            ORDER BY created_at DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT * FROM contacts
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const p = JSON.parse(event.body || '{}');
      const rows = await sql`
        INSERT INTO contacts (company_id, name, email, phone, title, role)
        VALUES (
          ${p.company_id || null},
          ${p.name || ''},
          ${p.email || null},
          ${p.phone || null},
          ${p.title || null},
          ${p.role || 'external'}
        )
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
