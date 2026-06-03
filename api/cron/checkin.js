const { WebClient } = require('@slack/web-api');
const { runCheckin } = require('../../lib/bot');

function verifyCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const app = { client };

  try {
    await runCheckin(app);
    return res.status(200).json({ ok: true, action: 'checkin' });
  } catch (err) {
    console.error('[bot] Cron checkin error:', err);
    return res.status(500).json({ error: err.message });
  }
};
