import { vi } from 'vitest';

const MOSPARO_ENV_VARS = [
  'NEXT_PUBLIC_MOSPARO_HOST',
  'NEXT_PUBLIC_MOSPARO_UUID',
  'NEXT_PUBLIC_MOSPARO_PUBLIC_KEY',
  'MOSPARO_HOST',
  'MOSPARO_UUID',
  'MOSPARO_PUBLIC_KEY',
  'MOSPARO_PRIVATE_KEY',
];

/** Start a test without any mosparo configuration in the environment. */
export function clearMosparoEnv(): void {
  for (const name of MOSPARO_ENV_VARS) vi.stubEnv(name, undefined);
}

/**
 * Stand-in for the widget class that mosparo-frontend.js puts on `window`.
 * Like the real widget, it renders into the container it is given.
 */
export function createMosparoMock() {
  return vi.fn(function (_containerId: string, ..._rest: unknown[]) {
    const widget = document.createElement('div');
    widget.className = 'mosparo__container';
    document.getElementById(_containerId)?.appendChild(widget);
  });
}

export type MosparoMock = ReturnType<typeof createMosparoMock>;

/** The mosparo script tags currently on the page. */
export function mosparoScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[src$="/build/mosparo-frontend.js"]',
    ),
  );
}

/** What the browser does when the script has downloaded and run. */
export function finishScriptLoad(
  script: HTMLScriptElement,
  mosparo: MosparoMock = createMosparoMock(),
): MosparoMock {
  window.mosparo = mosparo as unknown as Window['mosparo'];
  script.dispatchEvent(new Event('load'));
  return mosparo;
}

/** What the browser does when the script cannot be downloaded. */
export function failScriptLoad(script: HTMLScriptElement): void {
  script.dispatchEvent(new Event('error'));
}

/** Remove everything a test left on the page. */
export function resetPage(): void {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete (window as Partial<Window>).mosparo;
}
