require('dotenv').config();
const { App } = require('@slack/bolt');
const cron = require('node-cron');
const { isThreadReply, getDirectAnswer, THREAD_NUDGE, THANK_YOU } = require('./lib/dm-flow');

// ─── Config ───────────────────────────────────────────────────────────────────

const SUMMARY_CHANNEL_ID   = process.env.SUMMARY_CHANNEL_ID;
const CHECKIN_CRON         = process.env.CHECKIN_CRON || '0 16 * * 5';
const COLLECTION_WINDOW_MS = (parseInt(process.env.COLLECTION_WINDOW_MINUTES) || 60) * 60 * 1000;
const TEAM_MEMBER_IDS      = process.env.TEAM_MEMBER_IDS
  ? process.env.TEAM_MEMBER_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const QUESTIONS = [
  '1️⃣  *What did you work on this week?*',
  '2️⃣  *What are you planning to work on next week?*',
  '3️⃣  *Any blockers or anything you need help with?*',
];

// ─── State ────────────────────────────────────────────────────────────────────
//
// activeSessions  – users currently being asked questions
//   { [userId]: { dmChannelId: string, answers: string[], step: number } }
//
// completedAnswers – answers for users who finished, keyed by userId
//   { [userId]: string[] }

const activeSessions   = {};
const completedAnswers = {};

// ─── Slack App ────────────────────────────────────────────────────────────────

const app = new App({
  token:         process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode:    true,
  appToken:      process.env.SLACK_APP_TOKEN,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getMembersToCheck() {
  if (TEAM_MEMBER_IDS.length > 0) return TEAM_MEMBER_IDS;

  const result = await app.client.conversations.members({ channel: SUMMARY_CHANNEL_ID });
  const details = await Promise.all(
    result.members.map(id => app.client.users.info({ user: id }).catch(() => null))
  );
  return details
    .filter(u => u && !u.user.is_bot && !u.user.deleted)
    .map(u => u.user.id);
}

async function openDmAndAsk(userId) {
  if (activeSessions[userId]) {
    console.log(`[bot] Skipping ${userId} — check-in already in progress`);
    return;
  }

  const dm = await app.client.conversations.open({ users: userId });
  const dmChannelId = dm.channel.id;

  activeSessions[userId] = { dmChannelId, answers: [], step: 0 };

  await app.client.chat.postMessage({
    channel: dmChannelId,
    text: [
      `Hey there! 👋 It's *preloveyou* weekly check-in time.`,
      `I'll ask you 3 quick questions — reply directly in this chat (not in a thread).`,
    ].join('\n'),
  });
  await app.client.chat.postMessage({
    channel: dmChannelId,
    text: QUESTIONS[0],
  });
}

async function postSummary(memberIds) {
  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 Weekly Team Update — ${date}`, emoji: true },
    },
    { type: 'divider' },
  ];

  const responded = memberIds.filter(id => completedAnswers[id]);
  const noResponse = memberIds.filter(id => !completedAnswers[id]);

  if (responded.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No responses received this week._' },
    });
  }

  for (const userId of responded) {
    const [thisWeek, nextWeek, blockers] = completedAnswers[userId];
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `<@${userId}>`,
          `*This week:* ${thisWeek || '_No response_'}`,
          `*Next week:* ${nextWeek || '_No response_'}`,
          `*Blockers:* ${blockers || '_None_'}`,
        ].join('\n'),
      },
    });
    blocks.push({ type: 'divider' });
  }

  // Highlight blockers that look real (not "none", "no", "n/a")
  const noBlockerKeywords = /^(no|none|nope|n\/a|nothing|all good|-)$/i;
  const withBlockers = responded.filter(id => {
    const b = (completedAnswers[id][2] || '').trim();
    return b.length > 3 && !noBlockerKeywords.test(b);
  });

  if (withBlockers.length > 0) {
    const lines = withBlockers.map(id => `• <@${id}>: ${completedAnswers[id][2]}`).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🚧 *Blockers needing attention:*\n${lines}` },
    });
    blocks.push({ type: 'divider' });
  }

  if (noResponse.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `⏳ No response from: ${noResponse.map(id => `<@${id}>`).join(', ')}`,
      }],
    });
  }

  await app.client.chat.postMessage({
    channel: SUMMARY_CHANNEL_ID,
    text: `Weekly team update — ${date}`,
    blocks,
  });

  console.log(`[bot] Summary posted. ${responded.length}/${memberIds.length} responded.`);

  // Clean up completed answers for this round
  memberIds.forEach(id => delete completedAnswers[id]);
}

// ─── DM Message Handler ───────────────────────────────────────────────────────

app.message(async ({ message, say, client }) => {
  const userId = message.user;
  if (!userId || message.bot_id) return;
  if (message.subtype && message.subtype !== 'file_share') return;

  const session = activeSessions[userId];
  if (!session) return;
  if (message.channel !== session.dmChannelId) return;

  if (isThreadReply(message)) {
    await client.chat.postMessage({ channel: session.dmChannelId, text: THREAD_NUDGE });
    return;
  }

  const answer = getDirectAnswer(message);
  if (!answer) return;

  session.answers.push(answer);
  session.step += 1;
  console.log(`[bot] Answer ${session.step}/${QUESTIONS.length} from ${userId}`);

  if (session.step < QUESTIONS.length) {
    await say(QUESTIONS[session.step]);
  } else {
    completedAnswers[userId] = [...session.answers];
    delete activeSessions[userId];
    await say(THANK_YOU);
  }
});

// ─── /standup Slash Command (manual trigger) ─────────────────────────────────

app.command('/standup', async ({ command, ack, respond }) => {
  await ack();
  console.log(`[bot] /standup triggered by ${command.user_id}`);
  await respond({ text: '🚀 Kicking off the weekly check-in now...' });
  runCheckin();
});

// ─── Core Check-in Runner ─────────────────────────────────────────────────────

async function runCheckin() {
  console.log('[bot] Running weekly check-in...');
  let members;
  try {
    members = await getMembersToCheck();
  } catch (err) {
    console.error('[bot] Failed to get members:', err.message);
    return;
  }

  console.log(`[bot] DMing ${members.length} member(s)...`);
  await Promise.allSettled(members.map(id => openDmAndAsk(id).catch(e => {
    console.error(`[bot] Failed to DM ${id}:`, e.message);
  })));

  // After collection window, post the summary
  setTimeout(() => postSummary(members).catch(e => {
    console.error('[bot] Failed to post summary:', e.message);
  }), COLLECTION_WINDOW_MS);
}

// ─── Cron Scheduler ──────────────────────────────────────────────────────────

cron.schedule(CHECKIN_CRON, runCheckin, { timezone: 'Asia/Karachi' });
console.log(`[bot] Check-in scheduled: "${CHECKIN_CRON}" (Asia/Karachi)`);

// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  await app.start();
  console.log('⚡️ preloveyou standup bot is running!');
})();
