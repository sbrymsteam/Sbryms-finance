const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const resolveLogin = require('./api/resolve-login');
const registerPushToken = require('./api/register-push-token');
const sendPush = require('./api/send-push');
const pushConfig = require('./api/push-config');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 5000);
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

app.use(cors());
app.use(express.json());
app.post('/api/resolve-login', resolveLogin);
app.all('/api/register-push-token', registerPushToken);
app.all('/api/send-push', sendPush);
app.all('/api/push-config', pushConfig);
app.get('/assets/login.html', (req, res) => {
  res.redirect(302, '/login.html');
});

app.get('/api/cloudinary-signature', (req, res) => {
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({
      error: 'Cloudinary uploads are not configured on this deployment.'
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'team-meet-attachments';
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  res.json({ apiKey, cloudName, folder, timestamp, signature });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});
app.use(express.static(path.join(__dirname)));

if (require.main === module) {
  app.listen(port, () => {
    console.log(`SBRYMS Finance server running at http://localhost:${port}`);
  });
}

module.exports = app;
