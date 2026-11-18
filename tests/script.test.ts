import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMosparoMock,
  failScriptLoad,
  finishScriptLoad,
  mosparoScripts,
  resetPage,
} from './helpers';

const HOST = 'https://mosparo.test';

// The loader remembers what it has loaded for the lifetime of the page, so
// every test gets a fresh copy of the module and a clean document.
let loadMosparoScript: typeof import('../src/core/script').loadMosparoScript;

beforeEach(async () => {
  vi.resetModules();
  ({ loadMosparoScript } = await import('../src/core/script'));
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

  it('accepts a host with a trailing slash', () => {
    void loadMosparoScript('https://mosparo.test/');

    expect(mosparoScripts()[0].src).toBe(
      'https://mosparo.test/build/mosparo-frontend.js',
    );
  });

  it('puts the given nonce on the script tag', () => {
    void loadMosparoScript(HOST, { nonce: 'r4nd0m' });

    expect(mosparoScripts()[0].nonce).toBe('r4nd0m');
  });

  it('adds no script when mosparo is already on the page', async () => {
    window.mosparo = createMosparoMock() as unknown as Window['mosparo'];

    await loadMosparoScript(HOST);

    expect(mosparoScripts()).toHaveLength(0);
  });

  it('waits for a script tag that is already on the page instead of adding one', async () => {
    const existing = document.createElement('script');
    existing.src = `${HOST}/build/mosparo-frontend.js`;
    document.head.appendChild(existing);

    const onLoaded = vi.fn();
    const loading = loadMosparoScript(HOST).then(onLoaded);
    await Promise.resolve();

    expect(mosparoScripts()).toEqual([existing]);
    expect(onLoaded).not.toHaveBeenCalled();

    finishScriptLoad(existing);
    await loading;
    expect(onLoaded).toHaveBeenCalledOnce();
  });

  it('rejects when the script cannot be loaded', async () => {
    const loading = loadMosparoScript(HOST);
    failScriptLoad(mosparoScripts()[0]);

    await expect(loading).rejects.toThrow(
      'Failed to load mosparo script from https://mosparo.test/build/mosparo-frontend.js',
    );
  });

  it('downloads the script again when it is requested after a failure', async () => {
    const failed = loadMosparoScript(HOST);
    const [failedScript] = mosparoScripts();
    failScriptLoad(failedScript);
    await expect(failed).rejects.toThrow();

    const onLoaded = vi.fn();
    const retry = loadMosparoScript(HOST).then(onLoaded);
    await new Promise((resolve) => setTimeout(resolve));

    const scripts = mosparoScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toBe(failedScript);
    expect(onLoaded).not.toHaveBeenCalled();

    finishScriptLoad(scripts[0]);
    await retry;
    expect(onLoaded).toHaveBeenCalledOnce();
  });
});
