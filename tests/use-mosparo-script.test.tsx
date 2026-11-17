import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMosparoMock,
  failScriptLoad,
  finishScriptLoad,
  mosparoScripts,
  resetPage,
} from './helpers';

const HOST = 'https://mosparo.test';

let useMosparoScript: typeof import('../src/use-mosparo-script').useMosparoScript;

beforeEach(async () => {
  vi.resetModules();
  ({ useMosparoScript } = await import('../src/use-mosparo-script'));
});

afterEach(() => {
  cleanup();
  resetPage();
});

describe('useMosparoScript', () => {
  it('is "loading" until the script has loaded, then "ready"', async () => {
    const { result } = renderHook(() => useMosparoScript(HOST));

    expect(result.current).toBe('loading');
    expect(mosparoScripts()).toHaveLength(1);

    await act(async () => {
      finishScriptLoad(mosparoScripts()[0]);
    });

    expect(result.current).toBe('ready');
  });

  it('is "error" when the script cannot be loaded', async () => {
    const { result } = renderHook(() => useMosparoScript(HOST));

    await act(async () => {
      failScriptLoad(mosparoScripts()[0]);
    });

    expect(result.current).toBe('error');
  });

  it('is "ready" straight away when mosparo is already on the page', () => {
    window.mosparo = createMosparoMock() as unknown as Window['mosparo'];

    const { result } = renderHook(() => useMosparoScript(HOST));

    expect(result.current).toBe('ready');
    expect(mosparoScripts()).toHaveLength(0);
  });

  it('requests nothing when there is no host', () => {
    const { result } = renderHook(() => useMosparoScript(''));

    expect(result.current).toBe('loading');
    expect(mosparoScripts()).toHaveLength(0);
  });
});
