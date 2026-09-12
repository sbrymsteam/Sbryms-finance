const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 5000);
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

if (require.main === module) {
  app.listen(port, () => {
    console.log(`SBRYMS Finance server running at http://localhost:${port}`);
  });
}

module.exports = app;
