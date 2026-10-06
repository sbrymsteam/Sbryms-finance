const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const jdkRoot = 'C:\\Program Files\\Eclipse Adoptium';
const sdkRoot = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const androidDir = path.join(root, 'android');
const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const publishPath = path.join(root, 'assets', 'SBRYMS-Finance.apk');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (process.platform !== 'win32') {
  throw new Error('The APK build helper currently supports Windows only.');
}

let javaHome = process.env.JAVA_HOME;
if (!javaHome || !fs.existsSync(path.join(javaHome, 'bin', 'java.exe'))) {
  const jdk = fs.readdirSync(jdkRoot, { withFileTypes: true })
    .find(entry => entry.isDirectory() && /^jdk-17.*-hotspot$/i.test(entry.name));
  if (!jdk) throw new Error('Install JDK 17 and set JAVA_HOME before building the APK.');
  javaHome = path.join(jdkRoot, jdk.name);
}

if (!fs.existsSync(sdkRoot)) {
  throw new Error(`Android SDK was not found at ${sdkRoot}. Install it in Android Studio.`);
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdkRoot,
  ANDROID_SDK_ROOT: sdkRoot,
  PATH: `${path.join(javaHome, 'bin')};${process.env.PATH || ''}`
};

run(process.execPath, [path.join(__dirname, 'prepare-mobile.js')]);
run('cmd.exe', ['/d', '/s', '/c', 'npx.cmd cap copy android'], { env });
run(path.join(javaHome, 'bin', 'java.exe'), [
  '-classpath',
  path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
  'org.gradle.wrapper.GradleWrapperMain',
  'assembleDebug'
], { cwd: androidDir, env });

if (!fs.existsSync(apkPath)) {
  throw new Error(`Gradle finished but APK was not found at ${apkPath}`);
}

fs.mkdirSync(path.dirname(publishPath), { recursive: true });
fs.copyFileSync(apkPath, publishPath);
console.log(`APK built and copied to ${publishPath}`);
