const { ExpressReceiver } = require('@slack/bolt');
const { createApp } = require('../lib/bot');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Vercel may present the path as / or /api/slack depending on routing
  endpoints: ['/', '/api/slack'],
  processBeforeResponse: true,
});

createApp(receiver);

receiver.app.get(['/', '/api/slack'], (req, res) => {
  res.status(200).send('preloveyou standup bot is running');
});

module.exports = receiver.app;
