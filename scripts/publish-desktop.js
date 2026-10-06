const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const installer = path.join(root, 'desktop-build', 'SBRYMS-Finance-Setup.exe');
const publicDownload = path.join(root, 'assets', 'SBRYMS-Finance-Setup.exe');

if (!fs.existsSync(installer)) {
  throw new Error(`Windows installer was not found at ${installer}`);
}

fs.copyFileSync(installer, publicDownload);
console.log(`Windows installer copied to ${publicDownload}`);
