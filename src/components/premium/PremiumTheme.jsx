// SkillCredit Expo: Regular User appearance only. Local UI preference, no backend writes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DARK_MODE_KEY = 'skillcredit:user:dark-mode';
const UserThemeContext = createContext({
  isDark: false,
  toggleDark: () => {},
  setDark: () => {},
});

export function UserThemeProvider({ children }) {
  const [isDark, setDark] = useState(false);
  const lastChoice = useRef(false);
  const manuallyChanged = useRef(false);
  const persistenceQueue = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(DARK_MODE_KEY)
      .then((value) => {
        if (mounted && !manuallyChanged.current) {
          lastChoice.current = value === 'true';
          setDark(lastChoice.current);
        }
      })
      .catch((error) => console.warn('Could not restore theme preference:', error?.message));
    return () => { mounted = false; };
  }, []);

  const changeDark = useCallback((next) => {
    const value = typeof next === 'function' ? !!next(lastChoice.current) : !!next;
    manuallyChanged.current = true;
    lastChoice.current = value;
    setDark(value);
    // Keep rapid-toggle persistence behavior; no extra animation or overlay.
    persistenceQueue.current = persistenceQueue.current
      .then(() => AsyncStorage.setItem(DARK_MODE_KEY, String(value)))
      .catch((error) => console.warn('Could not save theme preference:', error?.message));
  }, []);

  const toggleDark = useCallback(() => changeDark((value) => !value), [changeDark]);
  const context = useMemo(() => ({ isDark, toggleDark, setDark: changeDark }),
    [isDark, toggleDark, changeDark]);

  return <UserThemeContext.Provider value={context}>{children}</UserThemeContext.Provider>;
}

export const useUserTheme = () => useContext(UserThemeContext);
