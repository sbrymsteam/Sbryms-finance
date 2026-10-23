const express = require('express');
const cors = require('cors');
const path = require('path');
const resolveLogin = require('./api/resolve-login');
const registerPushToken = require('./api/register-push-token');
const sendPush = require('./api/send-push');
const pushConfig = require('./api/push-config');
const cloudinarySignature = require('./api/cloudinary-signature');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 5000);
app.use(cors());
app.use(express.json());
app.post('/api/resolve-login', resolveLogin);
app.all('/api/register-push-token', registerPushToken);
app.all('/api/send-push', sendPush);
app.all('/api/push-config', pushConfig);
app.all('/api/cloudinary-signature', cloudinarySignature);
app.get('/assets/login.html', (req, res) => {
  res.redirect(302, '/login.html');
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
