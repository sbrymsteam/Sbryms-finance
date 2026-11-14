(function () {
  var activeUid = '';
  var pendingStart = null;
  var pendingStop = null;

  function getPlugin() {
    return window.Capacitor
      && window.Capacitor.Plugins
      && window.Capacitor.Plugins.Presence;
  }

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
      pendingStart = plugin.start({
        uid: user.uid,
        refreshToken: user.refreshToken,
        apiKey: firebaseConfig.apiKey,
        projectId: firebaseConfig.projectId
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
