const {
  applyPushCors,
  authenticateRequest,
  getAdminServices,
  getBearerToken
} = require('./_push-common');

const allowedTypes = new Set(['message', 'team_call']);
const sendsByUid = new Map();

function canSend(uid) {
  const now = Date.now();
  const attempts = (sendsByUid.get(uid) || []).filter(time => now - time < 60_000);
  if (attempts.length >= 30) {
    sendsByUid.set(uid, attempts);
    return false;
  }
  attempts.push(now);
  sendsByUid.set(uid, attempts);
  return true;
}

async function getRecipientTokens(db, recipient, senderUid) {
  const userSnapshot = await db.collection('users').get();
  const recipients = userSnapshot.docs.filter(document => {
    if (document.id === senderUid) return false;
    if (recipient === 'all') return true;
    return String(document.data().email || '').trim().toLowerCase() === recipient;
  });
  const tokenGroups = await Promise.all(recipients.map(document =>
    document.ref.collection('pushTokens').get()
  ));
  return tokenGroups.flatMap(snapshot => snapshot.docs.map(document => ({
    ref: document.ref,
    token: document.data().token
  }))).filter(item => typeof item.token === 'string' && item.token.length > 0);
}

module.exports = async function sendPush(req, res) {
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
      res.status(401).json({ error: 'Sign-in is required.' });
      return;
    }
    if (!canSend(user.uid)) {
      res.status(429).json({ error: 'Too many notifications. Try again later.' });
      return;
    }

    const recipient = typeof req.body?.recipient === 'string'
      ? req.body.recipient.trim().toLowerCase()
      : '';
    const type = typeof req.body?.type === 'string' ? req.body.type : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 100) : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 240) : '';
    const callId = typeof req.body?.callId === 'string' ? req.body.callId.trim().slice(0, 120) : '';
    const roomId = typeof req.body?.roomId === 'string' ? req.body.roomId.trim().slice(0, 120) : '';
    const chat = typeof req.body?.chat === 'string' ? req.body.chat.trim().slice(0, 254).toLowerCase() : '';
    const callType = req.body?.callType === 'video' ? 'video' : 'audio';
    const groupCall = req.body?.groupCall === true;
    const callerName = typeof req.body?.callerName === 'string' ? req.body.callerName.trim().slice(0, 80) : '';
    if ((!recipient || (recipient !== 'all' && !recipient.includes('@')))
      || !allowedTypes.has(type) || !title || !body) {
      res.status(400).json({ error: 'A valid recipient, type, title, and message are required.' });
      return;
    }
    if (type === 'team_call' && ((!groupCall && (!callId || !chat.includes('@')))
      || (groupCall && !roomId))) {
      res.status(400).json({ error: 'Call notifications require valid call details.' });
      return;
    }
    if (recipient === String(user.email || '').trim().toLowerCase()) {
      res.status(200).json({ sent: 0 });
      return;
    }

    const targets = await getRecipientTokens(services.db, recipient, user.uid);
    let sent = 0;
    const messageTag = `sbryms-message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    for (let index = 0; index < targets.length; index += 500) {
      const batch = targets.slice(index, index + 500);
      const senderEmail = String(user.email || '').trim().toLowerCase();
      const notificationData = {
        type,
        title,
        body
      };
      if (type === 'team_call') {
        const callChat = groupCall ? 'team-group' : senderEmail;
        const answerUrl = groupCall
          ? `/team-meet-call.html?chat=team-group&group=true&room=${encodeURIComponent(roomId)}&call=${encodeURIComponent(callId)}&role=callee&type=${encodeURIComponent(callType)}`
          : `/team-meet-call.html?chat=${encodeURIComponent(senderEmail)}&call=${encodeURIComponent(callId)}&role=callee&type=${encodeURIComponent(callType)}`;
        Object.assign(notificationData, {
          callId,
          roomId,
          chat: callChat,
          callType,
          groupCall: String(groupCall),
          callerName: callerName || String(user.name || user.email || 'SBRYMS member').slice(0, 80),
          url: `/team-meet-chat.html?chat=${encodeURIComponent(callChat)}`,
          answerUrl
        });
      } else {
        const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const messageChat = recipient === 'all' ? 'team-group' : senderEmail;
        Object.assign(notificationData, {
          messageId,
          chat: messageChat,
          url: `/team-meet-chat.html?chat=${encodeURIComponent(messageChat)}`
        });
      }
      const result = await services.messaging.sendEachForMulticast({
        tokens: batch.map(target => target.token),
        data: notificationData,
        webpush: {
          notification: {
            title,
            body,
            tag: type === 'team_call'
              ? `sbryms-call-${callId || roomId}`
              : `sbryms-message-${notificationData.messageId || messageTag}`,`n            requireInteraction: type === 'team_call',
            renotify: type === 'team_call'
          },
          headers: { Urgency: 'high' }
        },
        android: { priority: 'high', ttl: 600_000 }
      });
      sent += result.successCount;
      const staleTokens = [];
      result.responses.forEach((response, responseIndex) => {
        if (!response.success && [
          'messaging/invalid-registration-token',
          'messaging/registration-token-not-registered'
        ].includes(response.error?.code)) {
          staleTokens.push(batch[responseIndex].ref.delete());
        }
      });
      await Promise.all(staleTokens);
    }
    res.status(200).json({ sent });
  } catch (error) {
    console.error('Push delivery failed:', error.message);
    res.status(503).json({ error: 'Push delivery is temporarily unavailable.' });
  }
};
