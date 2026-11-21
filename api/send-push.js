const {
  applyPushCors,
  authenticateRequest,
  getAdminServices,
  getBearerToken
} = require('./_push-common');

const allowedTypes = new Set(['app', 'message', 'team_call', 'call_state']);
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

async function getRecipientTokens(db, recipient, senderUid, includeSender = false) {
  const tokenCollection = db.collectionGroup('pushTokens');
  const snapshots = recipient === 'all'
    ? [await tokenCollection.get()]
    : await Promise.all((Array.isArray(recipient) ? recipient : [recipient])
      .map(email => tokenCollection.where('email', '==', email).get()));
  const found = snapshots.flatMap(snapshot => snapshot.docs).filter((document, index, documents) =>
    documents.findIndex(candidate => candidate.ref.path === document.ref.path) === index
  );
  return found.flatMap(document => {
    const owner = document.ref.parent.parent;
    const token = document.data().token;
    if ((!includeSender && owner?.id === senderUid)
      || typeof token !== 'string'
      || token.length === 0) return [];
    return [{ ref: document.ref, token }];
  });
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
    const callStatus = req.body?.callStatus === 'connected' || req.body?.callStatus === 'ended'
      ? req.body.callStatus
      : '';
    const callerName = typeof req.body?.callerName === 'string' ? req.body.callerName.trim().slice(0, 80) : '';
    const senderName = typeof req.body?.senderName === 'string'
      ? req.body.senderName.trim().slice(0, 80)
      : '';
    const senderPhoto = typeof req.body?.senderPhoto === 'string'
      && req.body.senderPhoto.startsWith('https://')
      ? req.body.senderPhoto.slice(0, 1500)
      : '';
    const appNotificationId = typeof req.body?.notificationId === 'string'
      ? req.body.notificationId.trim().slice(0, 120)
      : '';
    const appUrl = typeof req.body?.url === 'string'
      && req.body.url.startsWith('/')
      && !req.body.url.startsWith('//')
      ? req.body.url.slice(0, 240)
      : '/notifications.html';
    if (!allowedTypes.has(type)
      || (type === 'call_state'
        ? (!callId || !callStatus)
        : ((!recipient || (recipient !== 'all' && !recipient.includes('@')))
          || !title || !body))) {
      res.status(400).json({ error: 'A valid recipient, type, title, and message are required.' });
      return;
    }
    if (type === 'team_call' && ((!groupCall && (!callId || !chat.includes('@')))
      || (groupCall && (!callId || !roomId)))) {
      res.status(400).json({ error: 'Call notifications require valid call details.' });
      return;
    }
    let targets;
    if (type === 'call_state') {
      const callSnapshot = await services.db.collection('calls').doc(callId).get();
      const call = callSnapshot.data();
      const senderEmail = String(user.email || '').trim().toLowerCase();
      const callerEmail = String(call?.callerId || '').trim().toLowerCase();
      const receiverEmail = String(call?.receiverId || '').trim().toLowerCase();
      if (!callSnapshot.exists || !callerEmail || !receiverEmail
        || ![callerEmail, receiverEmail].includes(senderEmail)) {
        res.status(403).json({ error: 'This account cannot update the call state.' });
        return;
      }
      if (call.status !== callStatus) {
        res.status(409).json({ error: 'The call state has not been saved yet.' });
        return;
      }
      targets = await getRecipientTokens(services.db, [callerEmail, receiverEmail], user.uid, true);
    } else if (type !== 'app' && recipient === String(user.email || '').trim().toLowerCase()) {
      res.status(200).json({ sent: 0 });
      return;
    } else {
      targets = await getRecipientTokens(services.db, recipient, user.uid, type === 'app');
    }

    let sent = 0;
    let failed = 0;
    const errorCodes = new Set();
    for (let index = 0; index < targets.length; index += 500) {
      const batch = targets.slice(index, index + 500);
      const senderEmail = String(user.email || '').trim().toLowerCase();
      const titleSenderName = title.replace(/^new message from\s+/i, '').trim();
      const messageSenderName = senderName
        || titleSenderName
        || String(user.name || user.email || 'SBRYMS member').trim().slice(0, 80);
      const notificationData = {
        type,
        title: type === 'message' ? messageSenderName : title,
        body
      };
      if (type === 'call_state') {
        Object.assign(notificationData, { callId, callStatus });
      } else if (type === 'team_call') {
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
          callerPhoto: senderPhoto,
          url: answerUrl,
          chatUrl: `/team-meet-chat.html?chat=${encodeURIComponent(callChat)}`,
          answerUrl
        });
      } else if (type === 'message') {
        const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const messageChat = recipient === 'all' ? 'team-group' : senderEmail;
        Object.assign(notificationData, {
          senderName: messageSenderName,
          senderPhoto,
          messageId,
          chat: messageChat,
          url: `/team-meet-chat.html?chat=${encodeURIComponent(messageChat)}`
        });
      } else {
        Object.assign(notificationData, {
          appNotificationId: appNotificationId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: appUrl
        });
      }
      const result = await services.messaging.sendEachForMulticast({
        tokens: batch.map(target => target.token),
        data: notificationData,
        webpush: {
          headers: { Urgency: 'high' }
        },
        android: {
          priority: 'high',
          ttl: type === 'team_call' ? 60_000 : 600_000,
          ...(callId ? { collapseKey: callId.slice(0, 64) } : {})
        }
      });
      sent += result.successCount;
      failed += result.failureCount;
      const staleTokens = [];
      result.responses.forEach((response, responseIndex) => {
        if (!response.success) {
          const errorCode = response.error?.code || 'messaging/unknown-error';
          errorCodes.add(errorCode);
          if ([
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered'
          ].includes(errorCode)) {
            staleTokens.push(batch[responseIndex].ref.delete());
          }
        }
      });
      await Promise.all(staleTokens);
    }
    res.status(200).json({
      targets: targets.length,
      sent,
      failed,
      errorCodes: Array.from(errorCodes)
    });
  } catch (error) {
    console.error('Push delivery failed:', error.message);
    res.status(503).json({ error: 'Push delivery is temporarily unavailable.' });
  }
};
