const { Redis } = require('@upstash/redis');

const redis = Redis.fromEnv();

const SESSION_PREFIX = 'standup:session:';
const COMPLETED_PREFIX = 'standup:completed:';
const ROUND_KEY = 'standup:round';

async function getSession(userId) {
  return redis.get(`${SESSION_PREFIX}${userId}`);
}

async function setSession(userId, session) {
  await redis.set(`${SESSION_PREFIX}${userId}`, session, { ex: 7200 });
}

async function deleteSession(userId) {
  await redis.del(`${SESSION_PREFIX}${userId}`);
}

async function setCompleted(userId, answers) {
  await redis.set(`${COMPLETED_PREFIX}${userId}`, answers, { ex: 7200 });
}

async function getCompleted(userId) {
  return redis.get(`${COMPLETED_PREFIX}${userId}`);
}

async function deleteCompleted(userId) {
  await redis.del(`${COMPLETED_PREFIX}${userId}`);
}

async function setRound(memberIds) {
  await redis.set(ROUND_KEY, { memberIds, startedAt: Date.now() }, { ex: 7200 });
}

async function getRound() {
  return redis.get(ROUND_KEY);
}

async function clearRound() {
  await redis.del(ROUND_KEY);
}

module.exports = {
  getSession,
  setSession,
  deleteSession,
  setCompleted,
  getCompleted,
  deleteCompleted,
  setRound,
  getRound,
  clearRound,
};
