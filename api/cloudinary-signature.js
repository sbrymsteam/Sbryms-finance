const crypto = require('crypto');
const {
  applyPushCors,
  authenticateRequest,
  getAdminServices,
  getBearerToken
} = require('./_push-common');

const requestsByUid = new Map();

function canCreateSignature(uid) {
  const now = Date.now();
  const recentRequests = (requestsByUid.get(uid) || []).filter(time => now - time < 60_000);
  if (recentRequests.length >= 10) {
    requestsByUid.set(uid, recentRequests);
    return false;
  }
  recentRequests.push(now);
  requestsByUid.set(uid, recentRequests);
  return true;
}

module.exports = async function cloudinarySignature(req, res) {
  if (!applyPushCors(req, res)) {
    res.status(403).json({ error: 'Origin is not allowed.' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const services = getAdminServices();
    const user = await authenticateRequest(req, services.auth);
    if (!user || !getBearerToken(req)) {
      res.status(401).json({ error: 'Sign-in is required to upload attachments.' });
      return;
    }
    if (!canCreateSignature(user.uid)) {
      res.status(429).json({ error: 'Too many uploads. Please try again in a minute.' });
      return;
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      res.status(503).json({ error: 'Cloudinary uploads are not configured on this deployment.' });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'team-meet-attachments';
    const signature = crypto
      .createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');
    res.status(200).json({ apiKey, cloudName, folder, timestamp, signature });
  } catch (error) {
    console.error('Could not create attachment upload signature:', error);
    res.status(500).json({ error: 'Could not prepare the attachment upload.' });
  }
};
