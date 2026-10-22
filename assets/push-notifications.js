(function () {
  let nativePlatform = false;
  let nativePush = null;
  let nativeReady = Promise.resolve();
  let registrationWaiter = null;
  let registrationListenersAttached = false;
  let foregroundMessageListenerAttached = false;

  function getApiBase() {
    return nativePlatform
      ? 'https://sbryms.vercel.app'
      : window.location.origin;
  }

  function loadNativeCapacitorRuntime() {
    if (window.Capacitor || window.location.protocol !== 'http:'
      || window.location.hostname !== 'localhost' || window.location.port) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/assets/vendor/capacitor-core/capacitor.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Android app runtime could not be loaded.'));
      document.head.appendChild(script);
    });
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
      script.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Firebase Messaging could not be loaded.'));
      document.head.appendChild(script);
    });
  }

  async function showWebNotification(payload) {
    const data = payload.data || {};
    const notification = payload.notification || {};
    const isCall = data.type === 'team_call';
    const callId = data.callId || '';
    const title = notification.title || data.title || 'SBRYMS Finance';
    const body = notification.body || data.body || 'You have a new message or call.';
    const url = data.url || notification.url || '/team-meet.html';
    const answerUrl = data.answerUrl || '';
    const eventId = data.messageId || data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: '/assets/team-meet-icon.png',
      badge: '/assets/team-meet-icon.png',
      tag: isCall && callId
        ? `sbryms-call-${callId}`
        : `sbryms-${data.type || 'notification'}-${eventId}`,
      requireInteraction: isCall,
      renotify: isCall,
      vibrate: isCall ? [0, 500, 250, 500] : [0, 150],
      actions: isCall
        ? [{ action: 'answer', title: 'Answer' }, { action: 'dismiss', title: 'Dismiss' }]
        : [{ action: 'open', title: 'Open chat' }],
      data: { url, answerUrl }
    });
  }

  async function showWebNotification(payload) {
    const data = payload.data || {};
    const notification = payload.notification || {};
    const isCall = data.type === 'team_call';
    const callId = data.callId || '';
    const title = notification.title || data.title || 'SBRYMS Finance';
    const body = notification.body || data.body || 'You have a new message or call.';
    const url = data.url || notification.url || '/team-meet.html';
    const answerUrl = data.answerUrl || '';
    const eventId = data.messageId || data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: '/assets/team-meet-icon.png',
      badge: '/assets/team-meet-icon.png',
      tag: isCall && callId
        ? `sbryms-call-${callId}`
        : `sbryms-${data.type || 'notification'}-${eventId}`,
      requireInteraction: isCall,
      renotify: isCall,
      vibrate: isCall ? [0, 500, 250, 500] : [0, 150],
      actions: isCall
        ? [{ action: 'answer', title: 'Answer' }, { action: 'dismiss', title: 'Dismiss' }]
        : [{ action: 'open', title: 'Open chat' }],
      data: { url, answerUrl }
    });
  }
  async function registerWebToken() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      throw new Error('This browser does not support web push notifications.');
    }
    if (Notification.permission === 'denied') {
      throw new Error('Notifications are blocked for this site. Open the browser site settings, allow Notifications, reload, then enable again.');
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
    if (!foregroundMessageListenerAttached) {
      messaging.onMessage(payload => {
        showWebNotification(payload).catch(error => {
          console.error('Could not show the foreground push notification:', error);
        });
      });
      foregroundMessageListenerAttached = true;
    }
    if (!foregroundMessageListenerAttached) {
      messaging.onMessage(payload => {
        showWebNotification(payload).catch(error => {
          console.error('Could not show the foreground push notification:', error);
        });
      });
      foregroundMessageListenerAttached = true;
    }
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
      const notificationData = event.notification && event.notification.data;
      const target = notificationData && notificationData.url;
      if (typeof target === 'string' && target.startsWith('/')) {
        window.location.href = target;
      } else if (typeof target === 'string' && /^team-meet(?:-chat)?\.html(?:\?|$)/.test(target)) {
        window.location.href = target;
      }
    });
    registrationListenersAttached = true;
  }

  async function enable() {
    await nativeReady;
    await getCurrentUser();
    if (!nativePlatform) {
      await registerWebToken();
      localStorage.setItem('browserNotificationsEnabled', 'true');
      window.dispatchEvent(new Event('sbrymsPushStatusChange'));
      return;
    }
    const permission = await nativePush.requestPermissions();
    if (permission.receive !== 'granted') throw new Error('Android notification permission was not granted.');

    const registration = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Android push registration timed out.')), 20000);
      registrationWaiter = {
        resolve: () => { clearTimeout(timeout); registrationWaiter = null; resolve(); },
        reject: error => { clearTimeout(timeout); registrationWaiter = null; reject(error); }
      };
    });
    await nativePush.register();
    await registration;
    localStorage.setItem('browserNotificationsEnabled', 'true');
    window.dispatchEvent(new Event('sbrymsPushStatusChange'));
  }

  async function disable() {
    await nativeReady;
    await getCurrentUser();
    if (nativePlatform) {
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
      localStorage.setItem('browserNotificationsEnabled', 'false');
      window.dispatchEvent(new Event('sbrymsPushStatusChange'));
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
    if (!foregroundMessageListenerAttached) {
      messaging.onMessage(payload => {
        showWebNotification(payload).catch(error => {
          console.error('Could not show the foreground push notification:', error);
        });
      });
      foregroundMessageListenerAttached = true;
    }
    await messaging.deleteToken();
    localStorage.setItem('browserNotificationsEnabled', 'false');
    window.dispatchEvent(new Event('sbrymsPushStatusChange'));
  }

  async function getStatus() {
    await nativeReady;
    if (nativePlatform) {
      const permission = await nativePush.checkPermissions();
      return {
        platform: 'android',
        permission: permission.receive,
        enabled: permission.receive === 'granted' && Boolean(localStorage.getItem('nativePushToken'))
      };
    }
    const permission = 'Notification' in window ? Notification.permission : 'unsupported';
    return {
      platform: 'web',
      permission,
      enabled: permission === 'granted' && Boolean(localStorage.getItem('webPushToken'))
    };
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
    const preference = localStorage.getItem('browserNotificationsEnabled');
    if (preference === 'false') return;
    if (nativePlatform) {
      await nativeReady;
      const permission = await nativePush.checkPermissions();
      if (permission.receive === 'granted') {
        await nativePush.register();
        if (preference !== 'true') localStorage.setItem('browserNotificationsEnabled', 'true');
      window.dispatchEvent(new Event('sbrymsPushStatusChange'));
        window.dispatchEvent(new Event('sbrymsPushStatusChange'));
      }
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      await registerWebToken();
      if (preference !== 'true') localStorage.setItem('browserNotificationsEnabled', 'true');
      window.dispatchEvent(new Event('sbrymsPushStatusChange'));
    }
  }

  nativeReady = (async () => {
    await loadNativeCapacitorRuntime();
    nativePlatform = Boolean(window.Capacitor && window.Capacitor.isNativePlatform());
    if (nativePlatform) await attachNativeListeners();
    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(user => {
        if (user) restoreIfEnabled().catch(error => console.error('Could not restore push registration:', error));
      });
    }
  })();
  nativeReady.catch(error => console.error('Capacitor push setup could not start:', error));

  window.sbrymsPush = { enable, disable, send, getStatus };
  window.dispatchEvent(new Event('sbrymsPushReady'));
})();
