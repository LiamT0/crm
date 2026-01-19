// Netlify Function: /client_profile
// GET  -> return company profile for logged-in client
// PUT  -> update billing_email, phone, website, address for that company

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.email) {
    return json(401, { error: 'Unauthorized' });
  }

  try {
    const email = user.email.toLowerCase();
    const company = await sql`
      SELECT id, name, status, phone, website, address, portal_email, billing_email
      FROM companies
      WHERE lower(portal_email) = ${email}
      LIMIT 1;
    `;

    if (!company || company.length === 0) {
      return json(404, { error: 'No company assigned to this login. Ask ForgeOS to set companies.portal_email to your email.' });
    }

    const c = company[0];

    if (event.httpMethod === 'GET') {
      return json(200, { company: c });
    }

    if (event.httpMethod === 'PUT') {
      const payload = JSON.parse(event.body || '{}');
      const phone = payload.phone ?? c.phone;
      const website = payload.website ?? c.website;
      const address = payload.address ?? c.address;
      const billing_email = payload.billing_email ?? c.billing_email;

      const updated = await sql`
        UPDATE companies
        SET phone = ${phone}, website = ${website}, address = ${address}, billing_email = ${billing_email}
        WHERE id = ${c.id}
        RETURNING id, name, status, phone, website, address, portal_email, billing_email;
      `;

      return json(200, { company: updated[0] });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Server error', details: err.message });
  }
};
