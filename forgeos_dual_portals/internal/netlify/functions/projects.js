// Netlify Function: /projects
// - Employee: can pass ?company_id=<uuid>
// - Client: inferred by logged-in user's email -> companies.portal_email
// Requires Netlify Identity JWT (context.clientContext.user)

const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!context.clientContext || !context.clientContext.user) {
    return json(401, { error: 'Unauthorized' });
  }

  const user = context.clientContext.user;
  const email = (user.email || '').toLowerCase();
  const roles = (user.app_metadata && user.app_metadata.roles) || [];
  const isEmployee = Array.isArray(roles) && roles.includes('employee');

  try {
    if (event.httpMethod === 'GET') {
      let companyId = null;
      const qs = event.queryStringParameters || {};

      if (isEmployee && qs.company_id) {
        companyId = qs.company_id;
      } else {
        // Client mode: resolve company by portal_email
        const rows = await sql`
          SELECT id, name FROM companies
          WHERE LOWER(portal_email) = ${email}
          LIMIT 1;
        `;
        if (!rows || rows.length === 0) {
          return json(404, { error: 'No company is linked to this login yet. Ask ForgeOS to set your portal email on your company record.' });
        }
        companyId = rows[0].id;
      }

      const projects = await sql`
        SELECT id, company_id, name, status, percent_complete, start_date, due_date, last_update, client_visible, updated_at
        FROM projects
        WHERE company_id = ${companyId}
          AND (client_visible = TRUE OR ${isEmployee} = TRUE)
        ORDER BY updated_at DESC NULLS LAST;
      `;

      return json(200, { projects });
    }

    if (event.httpMethod === 'POST') {
      if (!isEmployee) return json(403, { error: 'Forbidden' });
      const payload = JSON.parse(event.body || '{}');
      const company_id = payload.company_id;
      const name = payload.name;
      if (!company_id || !name) return json(400, { error: 'company_id and name are required' });

      const rows = await sql`
        INSERT INTO projects (company_id, name, status, percent_complete, start_date, due_date, last_update, client_visible)
        VALUES (
          ${company_id},
          ${name},
          ${payload.status || 'in_progress'},
          ${Number(payload.percent_complete || 0)},
          ${payload.start_date || null},
          ${payload.due_date || null},
          ${payload.last_update || ''},
          ${payload.client_visible !== false}
        )
        RETURNING *;
      `;

      return json(200, { project: rows[0] });
    }

    if (event.httpMethod === 'PATCH') {
      if (!isEmployee) return json(403, { error: 'Forbidden' });
      const payload = JSON.parse(event.body || '{}');
      if (!payload.id) return json(400, { error: 'id is required' });

      const rows = await sql`
        UPDATE projects
        SET
          name = COALESCE(${payload.name || null}, name),
          status = COALESCE(${payload.status || null}, status),
          percent_complete = COALESCE(${payload.percent_complete ?? null}, percent_complete),
          start_date = COALESCE(${payload.start_date || null}, start_date),
          due_date = COALESCE(${payload.due_date || null}, due_date),
          last_update = COALESCE(${payload.last_update || null}, last_update),
          client_visible = COALESCE(${payload.client_visible ?? null}, client_visible),
          updated_at = NOW()
        WHERE id = ${payload.id}
        RETURNING *;
      `;

      return json(200, { project: rows[0] });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return json(500, { error: String(err.message || err) });
  }
};
