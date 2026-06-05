const { Redis } = require('@upstash/redis');

const SESSION_PREFIX = 'standup:session:';
const COMPLETED_PREFIX = 'standup:completed:';
const ROUND_KEY = 'standup:round';

const hasRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const memory = new Map();
let warnedNoRedis = false;

function warnNoRedis() {
  if (!warnedNoRedis) {
    warnedNoRedis = true;
    console.warn('[store] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory store (will not work across serverless invocations)');
  }
}

const redis = hasRedis ? Redis.fromEnv() : null;

async function getSession(userId) {
  const key = `${SESSION_PREFIX}${userId}`;
  if (redis) return redis.get(key);
  warnNoRedis();
  return memory.get(key) ?? null;
}

async function setSession(userId, session) {
  const key = `${SESSION_PREFIX}${userId}`;
  if (redis) {
    await redis.set(key, session, { ex: 7200 });
    return;
  }
  if (process.env.VERCEL) {
    throw new Error('Upstash Redis is required on Vercel — add the Redis integration in your Vercel project settings');
  }
  warnNoRedis();
  memory.set(key, session);
}

async function deleteSession(userId) {
  const key = `${SESSION_PREFIX}${userId}`;
  if (redis) {
    await redis.del(key);
    return;
  }
  memory.delete(key);
}

async function setCompleted(userId, answers) {
  const key = `${COMPLETED_PREFIX}${userId}`;
  if (redis) {
    await redis.set(key, answers, { ex: 7200 });
    return;
  }
  warnNoRedis();
  memory.set(key, answers);
}

async function getCompleted(userId) {
  const key = `${COMPLETED_PREFIX}${userId}`;
  if (redis) return redis.get(key);
  warnNoRedis();
  return memory.get(key) ?? null;
}

async function deleteCompleted(userId) {
  const key = `${COMPLETED_PREFIX}${userId}`;
  if (redis) {
    await redis.del(key);
    return;
  }
  memory.delete(key);
}

async function setRound(memberIds) {
  if (redis) {
    await redis.set(ROUND_KEY, { memberIds, startedAt: Date.now() }, { ex: 7200 });
    return;
  }
  warnNoRedis();
  memory.set(ROUND_KEY, { memberIds, startedAt: Date.now() });
}

async function getRound() {
  if (redis) return redis.get(ROUND_KEY);
  warnNoRedis();
  return memory.get(ROUND_KEY) ?? null;
}

async function clearRound() {
  if (redis) {
    await redis.del(ROUND_KEY);
    return;
  }
  memory.delete(ROUND_KEY);
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
