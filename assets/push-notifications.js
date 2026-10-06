(function () {
  const nativePlatform = Boolean(window.Capacitor && window.Capacitor.isNativePlatform());
  let nativePush = null;
  let nativeReady = Promise.resolve();
  let registrationWaiter = null;
  let registrationListenersAttached = false;

  function getApiBase() {
    return window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:'
      ? 'https://sbryms.vercel.app'
      : window.location.origin;
  }

  async function getCurrentUser() {
    if (!window.firebase || !firebase.auth) {
      throw new Error('Firebase sign-in is not ready.');
    }
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Please sign in before enabling notifications.');
    return user;
  }

  async function apiRequest(path, payload) {
    const user = await getCurrentUser();
    const response = await fetch(`${getApiBase()}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Push notification request failed.');
    return result;
  }

  async function loadMessagingSdk() {
    if (firebase.messaging) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Firebase Messaging could not be loaded.'));
      document.head.appendChild(script);
    });
  }

  async function registerWebToken() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      throw new Error('This browser does not support web push notifications.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    await loadMessagingSdk();
    if (!await firebase.messaging.isSupported()) {
      throw new Error('This browser does not support Firebase web push.');
    }
    const configResponse = await fetch(`${getApiBase()}/api/push-config`, { cache: 'no-store' });
    const config = await configResponse.json();
    if (!configResponse.ok || !config.vapidKey) {
      throw new Error(config.error || 'Web push is not configured on the server.');
    }
    const worker = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: worker
    });
    if (!token) throw new Error('Firebase did not return a browser push token.');
    await apiRequest('/api/register-push-token', { token, platform: 'web' });
    localStorage.setItem('webPushToken', token);
  }

  async function attachNativeListeners() {
    if (!nativePlatform || registrationListenersAttached) return;
    const module = await import('./vendor/capacitor-push/index.js');
    nativePush = module.PushNotifications;
    await nativePush.addListener('registration', async token => {
      try {
        await apiRequest('/api/register-push-token', {
          token: token.value,
          platform: 'android'
        });
        localStorage.setItem('nativePushToken', token.value);
        if (registrationWaiter) registrationWaiter.resolve();
      } catch (error) {
        if (registrationWaiter) registrationWaiter.reject(error);
        else console.error('Could not save Android push token:', error);
      }
    });
    await nativePush.addListener('registrationError', error => {
      if (registrationWaiter) registrationWaiter.reject(new Error(error.error || 'Android push registration failed.'));
      else console.error('Android push registration failed:', error);
    });
    await nativePush.addListener('pushNotificationActionPerformed', event => {
      const target = event.notification?.data?.url;
      if (typeof target === 'string' && target.startsWith('/')) {
        window.location.href = target;
      } else if (typeof target === 'string' && /^team-meet(?:-chat)?\.html(?:\?|$)/.test(target)) {
        window.location.href = target;
      }
    });
    registrationListenersAttached = true;
  }

  async function enable() {
    if (!nativePlatform) {
      await registerWebToken();
      return;
    }
    await nativeReady;
    const permission = await nativePush.requestPermissions();
    if (permission.receive !== 'granted') throw new Error('Android notification permission was not granted.');

    const registration = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Android push registration timed out.')), 20_000);
      registrationWaiter = {
        resolve: () => { clearTimeout(timeout); registrationWaiter = null; resolve(); },
        reject: error => { clearTimeout(timeout); registrationWaiter = null; reject(error); }
      };
    });
    await nativePush.register();
    await registration;
  }

  async function disable() {
    await getCurrentUser();
    if (nativePlatform) {
      await nativeReady;
      const token = localStorage.getItem('nativePushToken');
      if (token) {
        await apiRequest('/api/register-push-token', {
          token,
          platform: 'android',
          action: 'remove'
        });
        localStorage.removeItem('nativePushToken');
      }
      await nativePush.unregister();
      return;
    }
    if (!('serviceWorker' in navigator) || !('Notification' in window)
      || Notification.permission !== 'granted') return;
    await loadMessagingSdk();
    if (!firebase.messaging) return;
    const token = localStorage.getItem('webPushToken');
    if (token) {
      await apiRequest('/api/register-push-token', { token, platform: 'web', action: 'remove' });
      localStorage.removeItem('webPushToken');
    }
    const messaging = firebase.messaging();
    await messaging.deleteToken();
  }

  async function send(payload) {
    try {
      return await apiRequest('/api/send-push', payload);
    } catch (error) {
      console.error('Could not send push notification:', error);
      return null;
    }
  }

  async function restoreIfEnabled() {
    if (localStorage.getItem('browserNotificationsEnabled') !== 'true') return;
    if (nativePlatform) {
      await nativeReady;
      const permission = await nativePush.checkPermissions();
      if (permission.receive === 'granted') await nativePush.register();
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      await registerWebToken();
    }
  }

  if (nativePlatform) {
    nativeReady = attachNativeListeners();
    nativeReady.catch(error => console.error('Android push plugin could not be loaded:', error));
  }
  if (window.firebase && firebase.auth) {
    firebase.auth().onAuthStateChanged(user => {
      if (user) restoreIfEnabled().catch(error => console.error('Could not restore push registration:', error));
    });
  }

  window.sbrymsPush = { enable, disable, send };
})();
