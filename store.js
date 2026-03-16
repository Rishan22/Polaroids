import { kv } from '@vercel/kv';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function id() {
  return Math.random().toString(36).slice(2, 10) +
         Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).set(CORS).end();
  }

  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  // POST /store  — save cipher
  // body: { user, name, cipher }
  // returns: { id }
  if (req.method === 'POST') {
    const { user, name, cipher } = req.body ?? {};
    if (!user || !name || !cipher) {
      return res.status(400).json({ error: 'user, name, cipher required' });
    }
    const cid = id();
    const now = Date.now();
    const record = { id: cid, user, name, cipher, created: now, updated: now };

    await kv.set(`c:${cid}`, record);
    // maintain per-user index as a sorted set (score = timestamp)
    await kv.zadd(`u:${user}`, { score: now, member: cid });

    return res.status(200).json({ id: cid });
  }

  // GET /store?id=xxx  — load single cipher
  if (req.method === 'GET' && req.query.id) {
    const record = await kv.get(`c:${req.query.id}`);
    if (!record) return res.status(404).json({ error: 'not found' });
    return res.status(200).json(record);
  }

  // GET /store?user=xxx  — list user's ciphers, newest first
  if (req.method === 'GET' && req.query.user) {
    const ids = await kv.zrange(`u:${req.query.user}`, 0, -1, { rev: true });
    if (!ids.length) return res.status(200).json([]);
    const records = await Promise.all(ids.map(cid => kv.get(`c:${cid}`)));
    return res.status(200).json(records.filter(Boolean));
  }

  return res.status(400).json({ error: 'invalid request' });
}
