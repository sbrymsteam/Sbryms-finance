const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'www');
const ignored = new Set([
  '.git',
  '.github',
  '.idea',
  '.vscode',
  'android',
  'node_modules',
  'api',
  'scripts',
  'www',
  'desktop',
  'desktop-build',
  'desktop-dist',
  'package.json',
  'package-lock.json',
  'server.js',
  'vercel.json',
  '.env',
  'firestore.rules',
  'README.md',
  'capacitor.config.json'
]);

function shouldCopy(sourcePath) {
  const relativePath = path.relative(root, sourcePath);
  const segments = relativePath.split(path.sep);

  if (segments.some(segment => ignored.has(segment))) return false;
  if (segments.some(segment => segment.startsWith('.') && segment !== '.well-known')) return false;
  return !/\.(apk|aab|exe|jks|keystore)$/i.test(sourcePath);
}

if (fs.existsSync(target)) {
  for (const file of fs.readdirSync(target)) {
    const curPath = path.join(target, file);
    try {
      fs.rmSync(curPath, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Warning: Could not remove ${curPath}: ${e.message}`);
    }
  }
} else {
  fs.mkdirSync(target, { recursive: true });
}

for (const entry of fs.readdirSync(root)) {
  const source = path.join(root, entry);
  const destination = path.join(target, entry);
  if (!shouldCopy(source)) continue;

  fs.cpSync(source, destination, {
    recursive: true,
    filter: shouldCopy
  });
}

const capacitorVendor = path.join(target, 'assets', 'vendor');
const coreSource = path.join(root, 'node_modules', '@capacitor', 'core', 'dist', 'index.js');
const pushPluginPackage = path.join(root, 'node_modules', '@capacitor', 'push-notifications', 'package.json');
if (!fs.existsSync(coreSource) || !fs.existsSync(pushPluginPackage)) {
  throw new Error('Capacitor push notification dependencies are missing. Run npm install before preparing the Android app.');
}
fs.mkdirSync(path.join(capacitorVendor, 'capacitor-core'), { recursive: true });
fs.copyFileSync(coreSource, path.join(capacitorVendor, 'capacitor-core', 'index.js'));
const pushPluginTarget = path.join(capacitorVendor, 'capacitor-push');
fs.mkdirSync(pushPluginTarget, { recursive: true });
fs.writeFileSync(
  path.join(pushPluginTarget, 'index.js'),
  "import { registerPlugin } from '@capacitor/core';\nexport const PushNotifications = registerPlugin('PushNotifications', {});\n"
);

for (const requiredFile of ['index.html', 'login.html', 'manifest.json']) {
  if (!fs.existsSync(path.join(target, requiredFile))) {
    throw new Error(`Required web file was not included in mobile bundle: ${requiredFile}`);
  }
}

console.log('Prepared the latest web files in www for Capacitor.');
