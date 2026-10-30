(function () {
  var activeUid = '';
  var pendingStart = null;
  var pendingStop = null;

  function getPlugin() {
    return window.Capacitor
      && window.Capacitor.Plugins
      && window.Capacitor.Plugins.Presence;
  }

  function requestNotificationPermission() {
    if (window.sbrymsPushReady) {
      return window.sbrymsPushReady.then(function (push) {
        return push.requestNotificationPermission();
      });
    }
    if (window.sbrymsPush && window.sbrymsPush.requestNotificationPermission) {
      return window.sbrymsPush.requestNotificationPermission();
    }
    if (window.__sbrymsNotificationPermissionPromise) {
      return window.__sbrymsNotificationPermissionPromise;
    }
    var pushPlugin = window.Capacitor && window.Capacitor.Plugins
      && window.Capacitor.Plugins.PushNotifications;
    if (!pushPlugin || !pushPlugin.checkPermissions || !pushPlugin.requestPermissions) {
      return Promise.reject(new Error('Android notification permissions are unavailable.'));
    }
    window.__sbrymsNotificationPermissionPromise = pushPlugin.checkPermissions()
      .then(function (permission) {
        return permission.receive === 'granted'
          ? permission
          : pushPlugin.requestPermissions();
      })
      .then(function (permission) {
        if (permission.receive !== 'granted') {
          throw new Error('Android notification permission was not granted.');
        }
        return permission;
      })
      .finally(function () {
        window.__sbrymsNotificationPermissionPromise = null;
      });
    return window.__sbrymsNotificationPermissionPromise;
  }

  window.sbrymsEnsureNotificationPermission = requestNotificationPermission;
  window.sbrymsPresence = {
    isAvailable: function () {
      return Boolean(getPlugin());
    },
    start: function (user, firebaseConfig) {
      var plugin = getPlugin();
      if (!plugin || !user || !firebaseConfig) return Promise.resolve(false);
      if (!user.uid || !user.refreshToken || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
        return Promise.reject(new Error('Firebase presence credentials are incomplete.'));
      }
      if (activeUid === user.uid) return Promise.resolve(true);
      if (pendingStart) return pendingStart.then(function () {
        return window.sbrymsPresence.start(user, firebaseConfig);
      });
      pendingStart = requestNotificationPermission().then(function () {
        return plugin.start({
          uid: user.uid,
          refreshToken: user.refreshToken,
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId
        });
      }).then(function () {
        activeUid = user.uid;
        return true;
      }).finally(function () {
        pendingStart = null;
      });
      return pendingStart;
    },
    stop: function () {
      var plugin = getPlugin();
      if (!plugin) return Promise.resolve(false);
      if (pendingStop) return pendingStop;
      var waitForStart = pendingStart ? pendingStart.catch(function (error) {
        console.warn('Presence service startup did not complete before logout:', error);
      }) : Promise.resolve();
      pendingStop = waitForStart.then(function () {
        return plugin.stop();
      }).then(function () {
        activeUid = '';
        return true;
      }).finally(function () {
        pendingStop = null;
      });
      return pendingStop;
    }
  };

  function startForSignedInUser() {
    if (!window.firebase || !firebase.apps || !firebase.apps.length || !firebase.auth) return;
    var config = firebase.app().options;
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      window.sbrymsPresence.start(user, config).catch(function (error) {
        console.error('Could not start background presence service:', error);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startForSignedInUser, { once: true });
  } else {
    startForSignedInUser();
  }
})();
