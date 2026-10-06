const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

function getAdminServices() {
  const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || (process.env.FIREBASE_SERVICE_ACCOUNT_FILE
      ? fs.readFileSync(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_FILE), 'utf8')
      : '');
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
  return {
    auth: getAuth(app),
    db: getFirestore(app),
    messaging: getMessaging(app)
  };
}

function applyPushCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    'https://sbryms.vercel.app',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost',
    ...(process.env.PUSH_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  ]);
  const requestHost = req.headers.host;
  const sameOrigin = requestHost && (origin === `https://${requestHost}` || origin === `http://${requestHost}`);
  if (origin && !allowedOrigins.has(origin) && !sameOrigin) return false;

  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  return true;
}

async function authenticateRequest(req, auth) {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await auth.verifyIdToken(match[1]);
  } catch (error) {
    if ([
      'auth/argument-error',
      'auth/id-token-expired',
      'auth/invalid-id-token',
      'auth/invalid-credential'
    ].includes(error.code)) return null;
    throw error;
  }
}

function tokenDocumentId(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

module.exports = {
  FieldValue,
  applyPushCors,
  authenticateRequest,
  getAdminServices,
  getBearerToken,
  tokenDocumentId
};
