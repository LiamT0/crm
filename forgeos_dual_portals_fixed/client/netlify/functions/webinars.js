// Netlify Function: /webinars (public)

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async () => {
  // Simple stub. Replace with DB-backed webinars later.
  const webinars = [
    {
      id: 'w1',
      title: 'AI Automation 101 for Trades',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      summary: 'How we auto-generate quotes, read invoices, and schedule jobs.',
      link: '',
    },
    {
      id: 'w2',
      title: 'Invoice Intake to QuickBooks — Live Demo',
      date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      summary: 'End-to-end invoice capture + posting workflows.',
      link: '',
    }
  ];
  return json(200, { webinars });
};
