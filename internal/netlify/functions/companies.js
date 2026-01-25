// =====================================================
// FILE: netlify/functions/companies.js (UPDATED)
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
    // GET - Fetch all companies with aggregated stats
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.id;
      
      if (id) {
        // Get single company
        const rows = await sql`
          SELECT * FROM companies WHERE id = ${id} LIMIT 1
        `;
        return json(200, rows?.[0] || null);
      }
      
      // Get all companies with stats
      const rows = await sql`
        SELECT 
          c.*,
          COUNT(DISTINCT co.id)::int as contact_count,
          COUNT(DISTINCT p.id)::int as project_count,
          COUNT(DISTINCT d.id)::int as deal_count,
          COALESCE(SUM(d.value), 0)::numeric as deal_value
        FROM companies c
        LEFT JOIN contacts co ON c.id = co.company_id
        LEFT JOIN projects p ON c.id = p.company_id
        LEFT JOIN deals d ON c.id = d.company_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `;
      return json(200, rows);
    }

    // POST - Create new company
    if (event.httpMethod === 'POST') {
      const p = JSON.parse(event.body || '{}');
      
      if (!p.name) {
        return json(400, { error: 'Company name is required' });
      }

      const rows = await sql`
        INSERT INTO companies (name, industry, website, email, phone, address, notes)
        VALUES (
          ${p.name},
          ${p.industry || null},
          ${p.website || null},
          ${p.email || null},
          ${p.phone || null},
          ${p.address || null},
          ${p.notes || null}
        )
        RETURNING *
      `;

      // Log activity
      await sql`
        INSERT INTO activity_log (company_id, action_type, description)
        VALUES (${rows[0].id}, 'created', ${`Company "${p.name}" was created`})
      `;

      return json(201, rows[0]);
    }

    // PATCH - Update company
    if (event.httpMethod === 'PATCH') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      
      const p = JSON.parse(event.body || '{}');

      const rows = await sql`
        UPDATE companies
        SET
          name = COALESCE(${p.name || null}, name),
          industry = COALESCE(${p.industry || null}, industry),
          website = COALESCE(${p.website || null}, website),
          email = COALESCE(${p.email || null}, email),
          phone = COALESCE(${p.phone || null}, phone),
          address = COALESCE(${p.address || null}, address),
          notes = COALESCE(${p.notes || null}, notes),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (rows[0]) {
        await sql`
          INSERT INTO activity_log (company_id, action_type, description)
          VALUES (${id}, 'updated', ${`Company "${rows[0].name}" was updated`})
        `;
      }

      return json(200, rows[0] || null);
    }

    // DELETE - Delete company
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });

      const rows = await sql`
        DELETE FROM companies WHERE id = ${id} RETURNING name
      `;

      if (rows[0]) {
        return json(200, { message: `Company "${rows[0].name}" deleted` });
      }
      return json(404, { error: 'Company not found' });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || String(e) });
  }
};
