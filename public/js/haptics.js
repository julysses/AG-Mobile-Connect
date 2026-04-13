export const haptics = {
  light()  { if ('vibrate' in navigator) navigator.vibrate(10); },
  medium() { if ('vibrate' in navigator) navigator.vibrate(25); },
  heavy()  { if ('vibrate' in navigator) navigator.vibrate([50, 10, 50]); },
  error()  { if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]); },
};
