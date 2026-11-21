(() => {
  if (localStorage.getItem('callRingtone') === 'whatsapp-audio') {
    localStorage.setItem('callRingtone', 'uploaded-1');
  }
  localStorage.removeItem('callRingtoneDefaultVersion');
})();
