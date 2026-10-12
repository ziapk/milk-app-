import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';

// Open forms and popups, newest last. The Android back button closes the newest one
// instead of leaving the app; with nothing open it exits as usual.
const stack = [];

if (window.Capacitor?.isNativePlatform?.()) {
  App.addListener('backButton', () => {
    if (stack.length) stack[stack.length - 1].current();
    else App.exitApp();
  });
}

// Call from a form while it is open; `onClose` runs when the back button is pressed.
export function useBackClose(onClose, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    stack.push(ref);
    return () => stack.splice(stack.lastIndexOf(ref), 1);
  }, [active]);
}
