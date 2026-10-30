(function () {
  let nativePlatform = false;
  let nativePush = null;
  let nativeReady = Promise.resolve();
  let registrationWaiter = null;
  let registrationListenersAttached = false;
  let foregroundMessageListenerAttached = false;
  let nativeRegistrationPromise = null;

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

  async function uploadProfilePhotoDataUrl(photoDataUrl, user) {
    const cacheKey = `profilePhotoCloudinary_${user.uid}`;
    const cachedPhoto = localStorage.getItem(cacheKey);
    if (cachedPhoto && cachedPhoto.startsWith('https://')) return cachedPhoto;

    const signature = await apiRequest('/api/cloudinary-signature', { purpose: 'profile-photo' });
    const formData = new FormData();
    formData.append('file', photoDataUrl);
    formData.append('api_key', signature.apiKey);
    formData.append('timestamp', String(signature.timestamp));
    formData.append('folder', signature.folder);
    formData.append('signature', signature.signature);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`,
      { method: 'POST', body: formData }
    );
    const uploaded = await response.json();
    if (!response.ok || typeof uploaded.secure_url !== 'string'
      || !uploaded.secure_url.startsWith('https://')) {
      throw new Error(uploaded.error && uploaded.error.message
        ? uploaded.error.message
        : 'Profile photo upload failed.');
    }

    localStorage.setItem(cacheKey, uploaded.secure_url);
    if (window.firebase && firebase.firestore) {
      await firebase.firestore().collection('users').doc(user.uid)
        .set({ photo: uploaded.secure_url }, { merge: true });
    }
    return uploaded.secure_url;
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
    const title = isCall
      ? (notification.title || data.callerName || data.title || 'Incoming call')
      : (data.senderName || data.title || notification.title || 'SBRYMS Finance');
    const body = notification.body || data.body || 'You have a new message or call.';
    const url = data.url || notification.url || '/team-meet.html';
    const answerUrl = data.answerUrl || '';
    const eventId = data.messageId || data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const senderPhoto = !isCall && typeof data.senderPhoto === 'string'
      && data.senderPhoto.startsWith('https://')
      ? data.senderPhoto
      : '';
    if (isCall && String(data.groupCall) === 'true'
      && window.location.pathname === '/team-meet.html'
      && document.visibilityState === 'visible') return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: isCall ? '/assets/app-icon-192.png' : (senderPhoto || '/assets/app-icon-192.png'),
      image: senderPhoto || undefined,
      badge: '/assets/app-icon-192.png',
      tag: isCall && callId
        ? `sbryms-call-${callId}`
        : (data.type === 'message'
          ? `sbryms-message-${data.chat || eventId}`
          : `sbryms-${data.type || 'notification'}-${eventId}`),
      requireInteraction: isCall,
      renotify: isCall,
      vibrate: isCall ? [0, 500, 250, 500] : [0, 150],
      actions: isCall
        ? [{ action: 'answer', title: 'Answer' }, { action: 'dismiss', title: 'Dismiss' }]
        : [{ action: 'open', title: 'Open chat' }],
      data: { url, answerUrl, chatUrl: data.chatUrl || url }
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

  async function requestNativeNotificationPermission() {
    if (window.sbrymsEnsureNotificationPermission) {
      return window.sbrymsEnsureNotificationPermission();
    }
    if (window.__sbrymsNotificationPermissionPromise) {
      return window.__sbrymsNotificationPermissionPromise;
    }
    window.__sbrymsNotificationPermissionPromise = nativePush.checkPermissions()
      .then(permission => permission.receive === 'granted'
        ? permission
        : nativePush.requestPermissions())
      .then(permission => {
        if (permission.receive !== 'granted') {
          throw new Error('Android notification permission was not granted.');
        }
        return permission;
      })
      .finally(() => {
        window.__sbrymsNotificationPermissionPromise = null;
      });
    return window.__sbrymsNotificationPermissionPromise;
  }

  async function requestNotificationPermission() {
    await nativeReady;
    if (!nativePlatform) return { receive: 'granted' };
    return requestNativeNotificationPermission();
  }

  async function registerNativeToken() {
    if (nativeRegistrationPromise) return nativeRegistrationPromise;
    let registrationTimeout;
    const registration = new Promise((resolve, reject) => {
      registrationTimeout = setTimeout(() => {
        registrationWaiter = null;
        reject(new Error('Android push registration timed out.'));
      }, 20000);
      registrationWaiter = {
        resolve: () => { clearTimeout(registrationTimeout); registrationWaiter = null; resolve(); },
        reject: error => { clearTimeout(registrationTimeout); registrationWaiter = null; reject(error); }
      };
    });
    nativeRegistrationPromise = Promise.resolve().then(async () => {
      await nativePush.register();
      await registration;
    }).catch(error => {
      if (registrationWaiter) {
        clearTimeout(registrationTimeout);
        registrationWaiter = null;
      }
      throw error;
    }).finally(() => {
      nativeRegistrationPromise = null;
    });
    return nativeRegistrationPromise;
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
    await requestNativeNotificationPermission();
    await registerNativeToken();
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
      const notificationPayload = { ...payload };
      if (typeof notificationPayload.senderPhoto === 'string'
        && /^data:image\/(jpeg|png|webp);base64,/i.test(notificationPayload.senderPhoto)) {
        try {
          const user = await getCurrentUser();
          notificationPayload.senderPhoto = await uploadProfilePhotoDataUrl(
            notificationPayload.senderPhoto,
            user
          );
        } catch (error) {
          console.error('Could not prepare the sender profile photo for push:', error);
          delete notificationPayload.senderPhoto;
        }
      } else if (typeof notificationPayload.senderPhoto !== 'string'
        || !notificationPayload.senderPhoto.startsWith('https://')) {
        delete notificationPayload.senderPhoto;
      }
      const result = await apiRequest('/api/send-push', notificationPayload);
      if (notificationPayload.type === 'message' && result.sent === 0) {
        console.warn('No recipient device has a registered push token. Open the APK and allow notifications on the recipient device.');
      }
      return result;
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
      try {
        await requestNativeNotificationPermission();
        await registerNativeToken();
        localStorage.setItem('browserNotificationsEnabled', 'true');
        window.dispatchEvent(new Event('sbrymsPushStatusChange'));
      } catch (error) {
        if (error.message === 'Android notification permission was not granted.'
          || error.message === 'Android notification permissions are unavailable.') {
          localStorage.setItem('browserNotificationsEnabled', 'false');
        }
        throw error;
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

  window.sbrymsPush = { enable, disable, send, getStatus, requestNotificationPermission };
  window.sbrymsPushReady = nativeReady.then(() => window.sbrymsPush);
  window.sbrymsPushReady.catch(error => {
    console.error('Push notification services could not initialize:', error);
  });
  window.dispatchEvent(new Event('sbrymsPushReady'));
})();
