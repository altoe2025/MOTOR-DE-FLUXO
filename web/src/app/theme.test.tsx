// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { applyTheme, readStoredTheme, useTheme } from './theme';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem('motor-de-fluxo:tema');
  delete document.documentElement.dataset.theme;
});

it('applies, toggles and retains the chosen theme', () => {
  function Subject() {
    const { theme, toggleTheme } = useTheme();
    return <button onClick={toggleTheme}>{theme}</button>;
  }
  applyTheme(readStoredTheme());
  render(<Subject />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'dark' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(readStoredTheme()).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'light' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
});

it('falls back safely when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
  expect(readStoredTheme()).toBe('dark');
});
