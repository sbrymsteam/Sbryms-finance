(() => {
  const version = 'whatsapp-audio-v1';
  if (localStorage.getItem('callRingtoneDefaultVersion') === version) return;
  localStorage.setItem('callRingtone', 'whatsapp-audio');
  localStorage.setItem('callRingtoneDefaultVersion', version);
})();
