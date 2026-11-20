(function () {
  const firebaseConfig = {
    apiKey: 'AIzaSyDKxpKDeoor1IQpFziQsZC5IjenkYjEtK8',
    authDomain: 'sbryms-finance.firebaseapp.com',
    projectId: 'sbryms-finance',
    storageBucket: 'sbryms-finance.appspot.com',
    messagingSenderId: '1087018056369',
    appId: '1:1087018056369:web:81bc39017385a649500090'
  };
  const sessionIdKey = 'sbrymsDeviceSessionId';
  const list = document.getElementById('deviceSessionsList');
  const status = document.getElementById('deviceSessionsStatus');
  const accountEmail = document.getElementById('deviceAccountEmail');
  const refreshButton = document.getElementById('refreshDeviceSessions');
  const signOutOthersButton = document.getElementById('signOutOtherDevices');
  let currentSessionId = localStorage.getItem(sessionIdKey);
  let currentSessionRef = null;
  let heartbeatTimer = null;
  let sessionsQuery = null;
  let firestorePromise = null;
  let signingOut = false;

  if (!currentSessionId) {
    currentSessionId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(sessionIdKey, currentSessionId);
  }

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'success';
  }

  function loadFirestore() {
    if (window.firebase && firebase.firestore) return Promise.resolve();
    if (firestorePromise) return firestorePromise;
    firestorePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load secure device-session storage.'));
      document.head.appendChild(script);
    });
    return firestorePromise;
  }

  function getDeviceDetails() {
    const userAgent = navigator.userAgent;
    const nativeApp = Boolean(
      window.Capacitor
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform()
    );
    const platform = /Android/i.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(userAgent)
        ? 'iPhone / iPad'
        : /Windows/i.test(userAgent)
          ? 'Windows'
          : /Macintosh|Mac OS/i.test(userAgent)
            ? 'Mac'
            : /Linux/i.test(userAgent)
              ? 'Linux'
              : 'Unknown device';
    const browser = nativeApp
      ? 'SBRYMS app'
      : /Edg\//i.test(userAgent)
        ? 'Microsoft Edge'
        : /Firefox\//i.test(userAgent)
          ? 'Firefox'
          : /Chrome\//i.test(userAgent)
            ? 'Google Chrome'
            : /Safari\//i.test(userAgent)
              ? 'Safari'
              : 'Web browser';
    return { browser, platform, deviceName: `${browser} · ${platform}` };
  }

  function timestampToDate(value) {
    return value && typeof value.toDate === 'function' ? value.toDate() : null;
  }

  function formatLastActive(value) {
    const date = timestampToDate(value);
    if (!date) return 'এইমাত্র সক্রিয়';
    return `শেষ সক্রিয় ${new Intl.DateTimeFormat('bn-BD', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date)}`;
  }

  function createSessionCard(sessionId, data) {
    const card = document.createElement('article');
    card.className = 'device-session-card';

    const icon = document.createElement('div');
    icon.className = 'device-session-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = /Android|iPhone|iPad/i.test(data.platform || '') ? '📱' : '💻';

    const details = document.createElement('div');
    details.className = 'device-session-details';
    const name = document.createElement('strong');
    name.textContent = data.deviceName || `${data.browser || 'Unknown browser'} · ${data.platform || 'Unknown device'}`;
    details.appendChild(name);
    const activity = document.createElement('small');
    activity.textContent = formatLastActive(data.lastActiveAt);
    details.appendChild(activity);

    const actions = document.createElement('div');
    actions.className = 'device-session-actions';
    if (sessionId === currentSessionId) {
      const current = document.createElement('span');
      current.className = 'device-current-badge';
      current.textContent = 'এই ডিভাইস';
      actions.appendChild(current);
    } else {
      const button = document.createElement('button');
      button.className = 'device-signout-button';
      button.type = 'button';
      button.dataset.sessionId = sessionId;
      button.textContent = 'লগআউট করান';
      button.addEventListener('click', () => revokeSession(sessionId, button));
      actions.appendChild(button);
    }

    card.append(icon, details, actions);
    return card;
  }

  function renderSessions(snapshot) {
    if (!list) return;
    const activeSessions = snapshot.docs
      .filter(document => document.data().revoked !== true && document.data().signedOut !== true)
      .sort((left, right) => {
        const leftTime = timestampToDate(left.data().lastActiveAt)?.getTime() || 0;
        const rightTime = timestampToDate(right.data().lastActiveAt)?.getTime() || 0;
        return rightTime - leftTime;
      });
    list.replaceChildren();
    if (!activeSessions.length) {
      const empty = document.createElement('p');
      empty.className = 'device-sessions-empty';
      empty.textContent = 'কোনো login করা device পাওয়া যায়নি।';
      list.appendChild(empty);
      setStatus('কোনো active login device পাওয়া যায়নি।');
      return;
    }
    activeSessions.forEach(document => {
      list.appendChild(createSessionCard(document.id, document.data()));
    });
    setStatus(`${activeSessions.length}টি device-এ এই account login আছে।`);
  }

  async function revokeSession(sessionId, button) {
    if (!currentSessionRef || !sessionId) return;
    if (!window.confirm('এই device-টিকে account থেকে লগআউট করাতে চান?')) return;
    button.disabled = true;
    try {
      await currentSessionRef.parent.doc(sessionId).update({
        revoked: true,
        revokedAt: firebase.firestore.FieldValue.serverTimestamp(),
        revokedBy: currentSessionId
      });
      setStatus('Device-টি logout করা হয়েছে। Online থাকলে সেটি অল্প সময়ের মধ্যে sign out হবে।');
    } catch (error) {
      console.error('Could not sign out the selected device:', error);
      setStatus(error.message || 'Device logout করা যায়নি। আবার চেষ্টা করুন।', true);
      button.disabled = false;
    }
  }

  async function signOutOtherDevices() {
    if (!currentSessionRef || !sessionsQuery) return;
    signOutOthersButton.disabled = true;
    try {
      const snapshot = await sessionsQuery.get();
      const otherSessions = snapshot.docs.filter(document =>
        document.id !== currentSessionId
        && document.data().revoked !== true
        && document.data().signedOut !== true
      );
      if (!otherSessions.length) {
        setStatus('অন্য কোনো active device পাওয়া যায়নি।');
        return;
      }
      if (!window.confirm(`${otherSessions.length}টি অন্য device থেকে logout করাবেন?`)) return;
      await Promise.all(otherSessions.map(document => document.ref.update({
        revoked: true,
        revokedAt: firebase.firestore.FieldValue.serverTimestamp(),
        revokedBy: currentSessionId
      })));
      setStatus(`${otherSessions.length}টি device logout করা হয়েছে। Online device-গুলো অল্প সময়ের মধ্যে sign out হবে।`);
    } catch (error) {
      console.error('Could not sign out other devices:', error);
      setStatus(error.message || 'অন্য device-গুলো logout করা যায়নি। আবার চেষ্টা করুন।', true);
    } finally {
      signOutOthersButton.disabled = false;
    }
  }

  async function endCurrentSession() {
    if (signingOut) return;
    signingOut = true;
    if (currentSessionRef) {
      try {
        await currentSessionRef.update({
          revoked: true,
          revokedAt: firebase.firestore.FieldValue.serverTimestamp(),
          revokedBy: currentSessionId
        });
      } catch (error) {
        console.error('Could not close the current device session:', error);
      }
    }
    localStorage.removeItem(sessionIdKey);
    await firebase.auth().signOut();
    window.location.replace('login.html');
  }

  async function markCurrentSessionSignedOut() {
    if (!currentSessionRef) return;
    try {
      await currentSessionRef.update({
        signedOut: true,
        signedOutAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Could not update the signed-out device status:', error);
    }
  }

  async function startSession(user) {
    if (!user || !window.firebase) return;
    await loadFirestore();
    const db = firebase.firestore();
    currentSessionRef = db.collection('users').doc(user.uid)
      .collection('deviceSessions').doc(currentSessionId);
    const existing = await currentSessionRef.get();
    if (existing.exists && existing.data().revoked === true) {
      localStorage.removeItem(sessionIdKey);
      await firebase.auth().signOut();
      window.location.replace('login.html');
      return;
    }

    const device = getDeviceDetails();
    const sessionData = {
      uid: user.uid,
      ...device,
      revoked: false,
      signedOut: false,
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!existing.exists) sessionData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await currentSessionRef.set(sessionData, { merge: true });

    currentSessionRef.onSnapshot(snapshot => {
      if (!signingOut && snapshot.exists && snapshot.data().revoked === true) {
        endCurrentSession().catch(error => {
          console.error('Could not finish a revoked device session:', error);
        });
      }
    }, error => console.error('Could not watch the current device session:', error));

    sessionsQuery = db.collection('users').doc(user.uid).collection('deviceSessions')
      .orderBy('lastActiveAt', 'desc').limit(50);
    if (list) {
      sessionsQuery.onSnapshot(renderSessions, error => {
        console.error('Could not load signed-in devices:', error);
        setStatus('Device তালিকা লোড করা যায়নি। Firestore security rules deploy হয়েছে কি না দেখুন।', true);
      });
    }

    const updateLastActive = () => {
      if (document.visibilityState !== 'visible' || !firebase.auth().currentUser) return;
      currentSessionRef.update({
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(error => console.error('Could not update device activity:', error));
    };
    heartbeatTimer = window.setInterval(updateLastActive, 120000);
    document.addEventListener('visibilitychange', updateLastActive);
    window.addEventListener('focus', updateLastActive);

    if (list) setStatus('আপনার login করা device-গুলো লোড হচ্ছে…');
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      if (!sessionsQuery) return;
      refreshButton.disabled = true;
      try {
        renderSessions(await sessionsQuery.get());
      } catch (error) {
        console.error('Could not refresh signed-in devices:', error);
        setStatus('Device তালিকা refresh করা যায়নি।', true);
      } finally {
        refreshButton.disabled = false;
      }
    });
  }
  if (signOutOthersButton) signOutOthersButton.addEventListener('click', signOutOtherDevices);
  const signOutCurrentButton = document.getElementById('signOutCurrentDevice');
  if (signOutCurrentButton) signOutCurrentButton.addEventListener('click', () => {
    if (window.confirm('এই device থেকে logout করতে চান?')) {
      endCurrentSession().catch(error => {
        console.error('Could not sign out this device:', error);
        setStatus('এই device থেকে logout করা যায়নি।', true);
      });
    }
  });

  if (!window.firebase) return;
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.sbrymsDeviceSessionsCloseCurrent = markCurrentSessionSignedOut;
  firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (accountEmail) accountEmail.textContent = 'সাইন ইন করা account পাওয়া যায়নি';
      if (list) setStatus('Device দেখতে আগে account-এ login করুন।', true);
      return;
    }
    localStorage.setItem('currentUserUid', user.uid);
    localStorage.setItem('currentUserEmail', user.email || '');
    if (accountEmail) accountEmail.textContent = user.email || 'আপনার account';
    startSession(user).catch(error => {
      console.error('Could not register this signed-in device:', error);
      setStatus(error.message || 'এই device login হিসেবে save করা যায়নি।', true);
    });
  });
})();
