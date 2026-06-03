const { App } = require('@slack/bolt');
const store = require('./store');

const SUMMARY_CHANNEL_ID = process.env.SUMMARY_CHANNEL_ID;
const TEAM_MEMBER_IDS = process.env.TEAM_MEMBER_IDS
  ? process.env.TEAM_MEMBER_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const QUESTIONS = [
  '1️⃣  *What did you work on this week?*',
  '2️⃣  *What are you planning to work on next week?*',
  '3️⃣  *Any blockers or anything you need help with?*',
];

function createApp(receiver) {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    receiver,
    processBeforeResponse: true,
  });

  app.message(async ({ message, say }) => {
    const userId = message.user;
    if (!userId || message.bot_id || message.subtype) return;

    const session = await store.getSession(userId);
    if (!session || message.channel !== session.dmChannelId) return;

    const answer = (message.text || '').trim();
    session.answers.push(answer);
    session.step += 1;

    if (session.step < QUESTIONS.length) {
      await say(QUESTIONS[session.step]);
      await store.setSession(userId, session);
    } else {
      await store.setCompleted(userId, [...session.answers]);
      await store.deleteSession(userId);
      await say('✅ Thanks! Your update has been recorded. Have a great weekend! 🎉');
    }
  });

  app.command('/standup', async ({ command, ack, respond }) => {
    await ack();
    console.log(`[bot] /standup triggered by ${command.user_id}`);
    await respond({ text: '🚀 Kicking off the weekly check-in now...' });
    await runCheckin(app);
  });

  return app;
}

async function getMembersToCheck(app) {
  if (TEAM_MEMBER_IDS.length > 0) return TEAM_MEMBER_IDS;

  const result = await app.client.conversations.members({ channel: SUMMARY_CHANNEL_ID });
  const details = await Promise.all(
    result.members.map(id => app.client.users.info({ user: id }).catch(() => null))
  );
  return details
    .filter(u => u && !u.user.is_bot && !u.user.deleted)
    .map(u => u.user.id);
}

async function openDmAndAsk(app, userId) {
  const dm = await app.client.conversations.open({ users: userId });
  const dmChannelId = dm.channel.id;

  await store.setSession(userId, { dmChannelId, answers: [], step: 0 });

  await app.client.chat.postMessage({
    channel: dmChannelId,
    text: [
      `Hey there! 👋 It's *preloveyou* weekly check-in time.`,
      `I'll ask you 3 quick questions — just reply to each one!\n`,
      QUESTIONS[0],
    ].join('\n'),
  });
}

async function postSummary(app, memberIds) {
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

  const completedEntries = await Promise.all(
    memberIds.map(async id => ({ id, answers: await store.getCompleted(id) }))
  );
  const responded = completedEntries.filter(e => e.answers);
  const noResponse = memberIds.filter(id => !responded.find(r => r.id === id));

  if (responded.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No responses received this week._' },
    });
  }

  for (const { id: userId, answers } of responded) {
    const [thisWeek, nextWeek, blockers] = answers;
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

  const noBlockerKeywords = /^(no|none|nope|n\/a|nothing|all good|-)$/i;
  const withBlockers = responded.filter(({ answers }) => {
    const b = (answers[2] || '').trim();
    return b.length > 3 && !noBlockerKeywords.test(b);
  });

  if (withBlockers.length > 0) {
    const lines = withBlockers.map(({ id, answers }) => `• <@${id}>: ${answers[2]}`).join('\n');
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

  await Promise.all(memberIds.map(id => store.deleteCompleted(id)));
  await store.clearRound();
}

async function runCheckin(app) {
  console.log('[bot] Running weekly check-in...');
  let members;
  try {
    members = await getMembersToCheck(app);
  } catch (err) {
    console.error('[bot] Failed to get members:', err.message);
    return;
  }

  await store.setRound(members);

  console.log(`[bot] DMing ${members.length} member(s)...`);
  await Promise.allSettled(members.map(id => openDmAndAsk(app, id).catch(e => {
    console.error(`[bot] Failed to DM ${id}:`, e.message);
  })));
}

async function runSummary(app) {
  const round = await store.getRound();
  if (!round?.memberIds?.length) {
    console.log('[bot] No active check-in round — skipping summary.');
    return;
  }
  await postSummary(app, round.memberIds);
}

module.exports = { createApp, runCheckin, runSummary, QUESTIONS };
