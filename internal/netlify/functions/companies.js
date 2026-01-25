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

// =====================================================
// FILE: netlify/functions/contacts.js (UPDATED)
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
    // GET - Fetch contacts
    if (event.httpMethod === 'GET') {
      const company_id = event.queryStringParameters?.company_id;
      const id = event.queryStringParameters?.id;

      if (id) {
        const rows = await sql`
          SELECT co.*, c.name as company_name
          FROM contacts co
          LEFT JOIN companies c ON co.company_id = c.id
          WHERE co.id = ${id}
          LIMIT 1
        `;
        return json(200, rows?.[0] || null);
      }

      let rows;
      if (company_id) {
        rows = await sql`
          SELECT co.*, c.name as company_name
          FROM contacts co
          LEFT JOIN companies c ON co.company_id = c.id
          WHERE co.company_id = ${company_id}
          ORDER BY co.created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT co.*, c.name as company_name
          FROM contacts co
          LEFT JOIN companies c ON co.company_id = c.id
          ORDER BY co.created_at DESC
          LIMIT 500
        `;
      }
      return json(200, rows);
    }

    // POST - Create new contact
    if (event.httpMethod === 'POST') {
      const p = JSON.parse(event.body || '{}');

      if (!p.first_name || !p.last_name || !p.email) {
        return json(400, { error: 'first_name, last_name, and email are required' });
      }

      // Check for duplicate email
      const existing = await sql`
        SELECT id FROM contacts WHERE email = ${p.email}
      `;
      
      if (existing.length > 0) {
        return json(409, { error: 'Contact with this email already exists' });
      }

      const rows = await sql`
        INSERT INTO contacts (
          company_id, first_name, last_name, email, phone, 
          role, is_primary, status, source, notes
        )
        VALUES (
          ${p.company_id || null},
          ${p.first_name},
          ${p.last_name},
          ${p.email},
          ${p.phone || null},
          ${p.role || null},
          ${p.is_primary || false},
          ${p.status || 'active'},
          ${p.source || 'manual'},
          ${p.notes || null}
        )
        RETURNING *
      `;

      if (p.company_id) {
        await sql`
          INSERT INTO activity_log (company_id, contact_id, action_type, description)
          VALUES (
            ${p.company_id}, 
            ${rows[0].id}, 
            'created', 
            ${`Contact "${p.first_name} ${p.last_name}" was added`}
          )
        `;
      }

      return json(201, rows[0]);
    }

    // PATCH - Update contact
    if (event.httpMethod === 'PATCH') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });

      const p = JSON.parse(event.body || '{}');

      const rows = await sql`
        UPDATE contacts
        SET
          first_name = COALESCE(${p.first_name || null}, first_name),
          last_name = COALESCE(${p.last_name || null}, last_name),
          email = COALESCE(${p.email || null}, email),
          phone = COALESCE(${p.phone || null}, phone),
          role = COALESCE(${p.role || null}, role),
          is_primary = COALESCE(${p.is_primary ?? null}, is_primary),
          status = COALESCE(${p.status || null}, status),
          notes = COALESCE(${p.notes || null}, notes),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return json(200, rows[0] || null);
    }

    // DELETE - Delete contact
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });

      const rows = await sql`
        DELETE FROM contacts WHERE id = ${id} 
        RETURNING first_name, last_name
      `;

      if (rows[0]) {
        return json(200, { message: `Contact "${rows[0].first_name} ${rows[0].last_name}" deleted` });
      }
      return json(404, { error: 'Contact not found' });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || String(e) });
  }
};

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
