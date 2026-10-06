const { applyPushCors } = require('./_push-common');

const firebaseWebPushPublicKey = 'BMECM_GS24fWXTR51Ikid8J5uoYsfIN2CNwwCBKh0M7LVbpGuvz2TFWpJSsgzJZ05z5g442GpItROuv5ChhRPjo';

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
  const vapidKey = process.env.FIREBASE_WEB_PUSH_CERTIFICATE_KEY || firebaseWebPushPublicKey;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({ vapidKey });
};
