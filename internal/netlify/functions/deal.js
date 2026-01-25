
// =====================================================
// FILE: netlify/functions/deals.js (NEW)
// =====================================================
const { neon } = require('@neondatabase/serverless');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return json(500, { error: 'Missing DATABASE_URL' });
  const sql = neon(dbUrl);

  try {
    if (event.httpMethod === 'GET') {
      const company_id = event.queryStringParameters?.company_id;
      const id = event.queryStringParameters?.id;

      if (id) {
        const rows = await sql`
          SELECT d.*, c.name as company_name
          FROM deals d
          JOIN companies c ON d.company_id = c.id
          WHERE d.id = ${id}
          LIMIT 1
        `;
        return json(200, rows?.[0] || null);
      }

      let rows;
      if (company_id) {
        rows = await sql`
          SELECT d.*, c.name as company_name
          FROM deals d
          JOIN companies c ON d.company_id = c.id
          WHERE d.company_id = ${company_id}
          ORDER BY d.expected_close_date ASC NULLS LAST
        `;
      } else {
        rows = await sql`
          SELECT d.*, c.name as company_name
          FROM deals d
          JOIN companies c ON d.company_id = c.id
          ORDER BY d.expected_close_date ASC NULLS LAST
          LIMIT 500
        `;
      }
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const p = JSON.parse(event.body || '{}');

      if (!p.company_id || !p.name || p.value === undefined) {
        return json(400, { error: 'company_id, name, and value are required' });
      }

      const rows = await sql`
        INSERT INTO deals (
          company_id, name, value, status, probability, 
          expected_close_date, notes
        )
        VALUES (
          ${p.company_id},
          ${p.name},
          ${p.value},
          ${p.status || 'prospecting'},
          ${p.probability || 50},
          ${p.expected_close_date || null},
          ${p.notes || null}
        )
        RETURNING *
      `;

      await sql`
        INSERT INTO activity_log (company_id, deal_id, action_type, description)
        VALUES (
          ${p.company_id}, 
          ${rows[0].id}, 
          'created', 
          ${`Deal "${p.name}" worth $${p.value} was created`}
        )
      `;

      return json(201, rows[0]);
    }

    if (event.httpMethod === 'PATCH') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });

      const p = JSON.parse(event.body || '{}');

      const rows = await sql`
        UPDATE deals
        SET
          name = COALESCE(${p.name || null}, name),
          value = COALESCE(${p.value ?? null}, value),
          status = COALESCE(${p.status || null}, status),
          probability = COALESCE(${p.probability ?? null}, probability),
          expected_close_date = COALESCE(${p.expected_close_date || null}, expected_close_date),
          notes = COALESCE(${p.notes || null}, notes),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return json(200, rows[0] || null);
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });

      const rows = await sql`
        DELETE FROM deals WHERE id = ${id} RETURNING name
      `;

      if (rows[0]) {
        return json(200, { message: `Deal "${rows[0].name}" deleted` });
      }
      return json(404, { error: 'Deal not found' });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || String(e) });
  }
};
