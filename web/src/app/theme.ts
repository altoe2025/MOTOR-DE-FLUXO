import { useCallback, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'motor-de-fluxo:tema';

/** Preferência visual do usuário neste navegador; escuro quando nada foi escolhido ou o storage está indisponível. */
export function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* preferência só desta sessão */ }
      return next;
    });
  }, []);
  return { theme, toggleTheme };
}
