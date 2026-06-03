const { ExpressReceiver } = require('@slack/bolt');
const { createApp } = require('../lib/bot');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/',
  processBeforeResponse: true,
});

createApp(receiver);

module.exports = receiver.app;
