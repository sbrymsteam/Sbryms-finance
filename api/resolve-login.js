const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const allowedEmails = new Set([
  'ahmedmshakil4@gmail.com',
  'arafathusainkamil@gmail.com',
  'rifathusain498@gmail.com',
  'yeahyaahmed86@gmail.com',
  'mdmahdihasanoj@gmail.com',
  'mh0392723@gmail.com',
  'husainmddelowar498@gmail.com',
  'sbrymsteam@gmail.com'
]);
const rateLimitWindowMs = 15 * 60 * 1000;
const maxAttemptsPerWindow = 8;
const attemptsByAddress = new Map();
const banglaDigits = '০১২৩৪৫৬৭৮৯';

function normalizePhone(value) {
  let digits = String(value || '').replace(/[০-৯]/g, digit => String(banglaDigits.indexOf(digit))).replace(/\D/g, '');
  if (digits.startsWith('00880')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = `880${digits.slice(1)}`;
  return digits;
}

function getAdminFirestore() {
  const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountValue) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  const serviceAccount = JSON.parse(serviceAccountValue);
  if (serviceAccount.project_id !== 'sbryms-finance') {
    throw new Error('Firebase Admin credentials belong to the wrong project.');
  }
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  const app = getApps()[0] || initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
  return getFirestore(app);
}

function getAddressKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const address = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return address || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(address) {
  const now = Date.now();
  if (attemptsByAddress.size > 10000) {
    for (const [key, times] of attemptsByAddress) {
      if (!times.some(time => now - time < rateLimitWindowMs)) attemptsByAddress.delete(key);
    }
  }
  const recentAttempts = (attemptsByAddress.get(address) || []).filter(time => now - time < rateLimitWindowMs);
  attemptsByAddress.set(address, recentAttempts);
  return recentAttempts.length >= maxAttemptsPerWindow;
}

function recordAttempt(address) {
  const now = Date.now();
  const recentAttempts = (attemptsByAddress.get(address) || []).filter(time => now - time < rateLimitWindowMs);
  recentAttempts.push(now);
  attemptsByAddress.set(address, recentAttempts);
}

function clearAttempts(address) {
  attemptsByAddress.delete(address);
}

async function findAccountEmail(identifier, db) {
  if (identifier.includes('@')) {
    const email = identifier.toLowerCase();
    return allowedEmails.has(email) ? email : null;
  }

  const normalizedUsername = identifier.trim().toLowerCase();
  const normalizedPhone = normalizePhone(identifier);
  const snapshot = await db.collection('users').get();
  const matches = new Set();

  snapshot.forEach(document => {
    const data = document.data();
    const email = String(data.email || '').trim().toLowerCase();
    if (!email || !allowedEmails.has(email)) return;

    const usernames = [
      data.username,
      data.usernameNormalized,
      email.split('@')[0]
    ].filter(Boolean).map(value => String(value).trim().toLowerCase());
    const phones = [
      data.phone,
      data.phoneNormalized,
      data.mobile,
      data.mobileNumber,
      data.phoneNumber
    ].filter(Boolean).map(normalizePhone);

    if (usernames.includes(normalizedUsername)
      || (normalizedPhone && phones.includes(normalizedPhone))) {
      matches.add(email);
    }
  });

  return matches.size === 1 ? [...matches][0] : null;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    'https://sbryms.vercel.app',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost',
    ...(process.env.LOGIN_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  ]);
  const requestHost = req.headers.host;
  const sameOrigin = requestHost && (origin === `https://${requestHost}` || origin === `http://${requestHost}`);

  if (origin && !allowedOrigins.has(origin) && !sameOrigin) return false;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

module.exports = async function resolveLogin(req, res) {
  if (!applyCors(req, res)) {
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

  const address = getAddressKey(req);
  if (isRateLimited(address)) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!identifier || identifier.length > 254 || !password || password.length > 128) {
    res.status(400).json({ error: 'Identifier and password are required.' });
    return;
  }

  try {
    const db = getAdminFirestore();
    const email = await findAccountEmail(identifier, db);
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Login service is not configured.' });
      return;
    }
    if (!email) {
      recordAttempt(address);
      res.status(401).json({ error: 'Invalid identifier or password.' });
      return;
    }

    const verification = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        signal: AbortSignal.timeout(10000)
      }
    );
    if (!verification.ok) {
      recordAttempt(address);
      res.status(401).json({ error: 'Invalid identifier or password.' });
      return;
    }

    const verifiedAccount = await verification.json();
    if (String(verifiedAccount.email || '').toLowerCase() !== email) {
      recordAttempt(address);
      res.status(401).json({ error: 'Invalid identifier or password.' });
      return;
    }

    clearAttempts(address);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ email });
  } catch (error) {
    console.error('Identifier login service failed:', error.message);
    res.status(503).json({ error: 'Login service is temporarily unavailable.' });
  }
};
