const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function token() {
  return Math.random().toString(36).slice(2, 10) +
         Math.random().toString(36).slice(2, 10);
}

module.exports = async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // POST /store  — save a named epoch
  // body: { observer, label, epoch }
  // returns: { id }
  if (req.method === 'POST') {
    const { observer, label, epoch } = req.body || {};
    if (!observer || !label || !epoch) {
      return res.status(400).json({ error: 'observer, label, epoch required' });
    }
    const id = token();
    const now = Date.now();
    const record = { id, observer, label, epoch, created: now, updated: now };

    await redis.set(`e:${id}`, JSON.stringify(record));
    await redis.zadd(`o:${observer}`, { score: now, member: id });

    return res.status(200).json({ id });
  }

  // GET /store?id=xxx  — retrieve single epoch
  if (req.method === 'GET' && req.query.id) {
    const raw = await redis.get(`e:${req.query.id}`);
    if (!raw) return res.status(404).json({ error: 'not found' });
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.status(200).json(record);
  }

  // GET /store?observer=xxx  — list observer's epochs, newest first
  if (req.method === 'GET' && req.query.observer) {
    const ids = await redis.zrange(`o:${req.query.observer}`, 0, -1, { rev: true });
    if (!ids.length) return res.status(200).json([]);
    const raws = await Promise.all(ids.map(id => redis.get(`e:${id}`)));
    const records = raws
      .filter(Boolean)
      .map(r => typeof r === 'string' ? JSON.parse(r) : r);
    return res.status(200).json(records);
  }

  return res.status(400).json({ error: 'invalid request' });
};
