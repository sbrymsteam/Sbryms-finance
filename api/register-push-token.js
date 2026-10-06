const {
  FieldValue,
  applyPushCors,
  authenticateRequest,
  getAdminServices,
  tokenDocumentId
} = require('./_push-common');

module.exports = async function registerPushToken(req, res) {
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
    if (!user) {
      res.status(401).json({ error: 'Sign-in is required.' });
      return;
    }

    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const action = req.body?.action === 'remove' ? 'remove' : 'register';
    const platform = req.body?.platform === 'android' ? 'android' : 'web';
    if (!token || token.length > 4096) {
      res.status(400).json({ error: 'A valid push token is required.' });
      return;
    }

    const tokenRef = services.db.collection('users').doc(user.uid)
      .collection('pushTokens').doc(tokenDocumentId(token));
    if (action === 'remove') {
      await tokenRef.delete();
      res.status(200).json({ ok: true });
      return;
    }

    const tokenOwners = await services.db.collectionGroup('pushTokens')
      .where('token', '==', token)
      .get();
    await Promise.all(tokenOwners.docs
      .filter(document => document.ref.parent.parent?.id !== user.uid)
      .map(document => document.ref.delete()));
    await tokenRef.set({
      token,
      platform,
      email: String(user.email || '').trim().toLowerCase(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Push token registration failed:', error.message);
    res.status(503).json({ error: 'Push registration is temporarily unavailable.' });
  }
};
