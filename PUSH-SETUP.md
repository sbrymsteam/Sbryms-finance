# Push notification setup

Push delivery uses Firebase Cloud Messaging (FCM). Messages and team-call invitations are sent by the authenticated server API; browser and Android device tokens are stored under the signed-in user's Firestore account.

## Separate web hosting from Android build files

The Vercel deployment ignores the native `android/` project, desktop tooling, build scripts, and APK/AAB binaries through `.vercelignore`. The Android packaging script separately excludes server/API, Android source, and desktop/tooling files when preparing its `www/` bundle. The shared HTML/CSS/JavaScript pages and assets are intentionally included in both: the Capacitor APK displays those same app screens.

Run `npm start` to serve the website locally. For the Android APK, run `npm run mobile:apk` from the repository root on Windows with JDK 17 and Android SDK installed. The build is saved at `assets/SBRYMS-Finance.apk`; Gradle's original debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. APK/AAB files are ignored by Git and excluded from Vercel deployment.

## Web and PWA

1. The Firebase Web Push public key shown in Firebase Console is configured in `api/push-config.js`; it is public and does not need to be added to Vercel. Set `FIREBASE_WEB_PUSH_CERTIFICATE_KEY` only if you rotate that key.
2. Set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env` and Vercel to the Firebase Admin service-account JSON for the `sbryms-finance` project. Keep this private; never commit it or send it in chat.
3. Deploy the API and site over HTTPS. If the production origin is not `https://sbryms.vercel.app`, add its exact origin to `PUSH_ALLOWED_ORIGINS`.
4. Sign in, open **FACE APP → Settings → Browser notifications**, and enable notifications in the browser permission prompt.

The local `.env.example` lists the required variable names. Vercel environment-variable changes require a new deployment. Web push only works in browsers that support Firebase Messaging and allow notifications.

## Android app

1. In the same Firebase project, add an Android app with package name `com.sbryms.finance`.
2. Download its `google-services.json` and place it at `android/app/google-services.json`. This file is ignored by Git.
3. Deploy the API and set the Vercel variables above before installing the APK. Android uses the production API origin configured in `assets/push-notifications.js`.
4. Run `npm run mobile:sync`, then rebuild/install the Android app. In the app, open **FACE APP → Settings → Browser notifications** and grant Android's notification permission.

The Android app requires Google Play services and an internet connection. End-to-end delivery must be tested on a real Android device and browser after Firebase/Vercel configuration; this repository does not contain service-account credentials, the VAPID key, or `google-services.json`.
