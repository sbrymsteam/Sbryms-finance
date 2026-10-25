const { applyPushCors } = require('./_push-common');

module.exports = function pushConfig(req, res) {
  if (!applyPushCors(req, res)) {
    res.status(403).json({ error: 'Origin is not allowed.' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const vapidKey = process.env.FIREBASE_WEB_PUSH_CERTIFICATE_KEY?.trim();
  if (!vapidKey) {
    res.status(503).json({ error: 'Web push public key is not configured.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ vapidKey });
};
