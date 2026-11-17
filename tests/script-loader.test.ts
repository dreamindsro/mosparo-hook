import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  failScriptLoad,
  finishScriptLoad,
  mosparoScripts,
  resetPage,
} from './helpers';

const HOST = 'https://mosparo.test';

// The loader remembers what it has loaded for the lifetime of the page, so
// every test gets a fresh copy of the module and a clean document.
let loadMosparoScript: typeof import('../src/script-loader').loadMosparoScript;

beforeEach(async () => {
  vi.resetModules();
  ({ loadMosparoScript } = await import('../src/script-loader'));
});

afterEach(resetPage);

describe('loadMosparoScript', () => {
  it('adds the mosparo frontend script of the given host to the page', () => {
    void loadMosparoScript(HOST);

    const [script] = mosparoScripts();
    expect(script.src).toBe('https://mosparo.test/build/mosparo-frontend.js');
    expect(script.async).toBe(true);
    expect(script.parentElement).toBe(document.head);
  });

  it('resolves once the script has loaded, not before', async () => {
    const onLoaded = vi.fn();
    const loading = loadMosparoScript(HOST).then(onLoaded);

    await Promise.resolve();
    expect(onLoaded).not.toHaveBeenCalled();

    finishScriptLoad(mosparoScripts()[0]);
    await loading;
    expect(onLoaded).toHaveBeenCalledOnce();
  });

  it('adds the script only once, however often it is requested', async () => {
    const first = loadMosparoScript(HOST);
    const second = loadMosparoScript(HOST);
    expect(mosparoScripts()).toHaveLength(1);

    finishScriptLoad(mosparoScripts()[0]);
    await Promise.all([first, second]);

    await loadMosparoScript(HOST);
    expect(mosparoScripts()).toHaveLength(1);
  });

  it('loads a separate script for each mosparo host', () => {
    void loadMosparoScript('https://one.test');
    void loadMosparoScript('https://two.test');

    expect(mosparoScripts().map((script) => script.src)).toEqual([
      'https://one.test/build/mosparo-frontend.js',
      'https://two.test/build/mosparo-frontend.js',
    ]);
  });

  it('reuses a script tag that is already on the page', async () => {
    const existing = document.createElement('script');
    existing.src = `${HOST}/build/mosparo-frontend.js`;
    document.head.appendChild(existing);

    await loadMosparoScript(HOST);

    expect(mosparoScripts()).toEqual([existing]);
  });

  it('rejects when the script cannot be loaded', async () => {
    const loading = loadMosparoScript(HOST);
    failScriptLoad(mosparoScripts()[0]);

    await expect(loading).rejects.toThrow(
      'Failed to load mosparo script from https://mosparo.test/build/mosparo-frontend.js',
    );
  });
});
