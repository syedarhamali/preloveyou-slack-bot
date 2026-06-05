const THREAD_NUDGE =
  'Please reply directly in this chat, not in a thread — I\'m waiting for your answer to the question above.';

const THANK_YOU = '✅ Thanks! Your update has been recorded. Have a great weekend! 🎉';

function isThreadReply(message) {
  return Boolean(message.thread_ts && message.thread_ts !== message.ts);
}

function getDirectAnswer(message) {
  if (!message.user || message.bot_id) return null;
  if (message.subtype && message.subtype !== 'file_share') return null;
  if (isThreadReply(message)) return null;
  const text = (message.text || '').trim();
  return text || null;
}

module.exports = { isThreadReply, getDirectAnswer, THREAD_NUDGE, THANK_YOU };
