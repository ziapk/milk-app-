import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';

// Open forms and popups, newest last. The Android back button closes the newest one
// instead of leaving the app; with nothing open it exits as usual.
const stack = [];
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn(stack.length));

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
    changed();
    return () => {
      stack.splice(stack.lastIndexOf(ref), 1);
      changed();
    };
  }, [active]);
}

// True while any form or sub-screen is open (used to hide the floating + button over forms).
export function useSomethingOpen() {
  const [open, setOpen] = useState(stack.length > 0);
  useEffect(() => {
    const fn = (n) => setOpen(n > 0);
    listeners.add(fn);
    fn(stack.length);
    return () => listeners.delete(fn);
  }, []);
  return open;
}
