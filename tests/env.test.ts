import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientConfigFromEnv, serverConfigFromEnv } from '../src/env';
import { clearMosparoEnv } from './helpers';

beforeEach(clearMosparoEnv);

describe('clientConfigFromEnv', () => {
  it('reads the NEXT_PUBLIC_MOSPARO_* variables', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');

    expect(clientConfigFromEnv()).toEqual({
      host: 'https://mosparo.test',
      uuid: 'project-uuid',
      publicKey: 'public-key',
    });
  });

  it('ignores server-only variables, which the browser cannot see', () => {
    // Reading them would render the field on the server and nothing in the
    // browser.
    vi.stubEnv('MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'public-key');

    expect(clientConfigFromEnv()).toEqual({});
  });

  it('treats an empty variable as not set', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', '');

    expect(clientConfigFromEnv().host).toBeUndefined();
  });

  it('gives no config, and no error, where there is no process object', () => {
    vi.stubGlobal('process', undefined);

    expect(clientConfigFromEnv()).toEqual({});

    vi.unstubAllGlobals();
  });
});

describe('serverConfigFromEnv', () => {
  it('works with the setup from the README: public values plus a private key', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('MOSPARO_PRIVATE_KEY', 'private-key');

    expect(serverConfigFromEnv()).toEqual({
      host: 'https://mosparo.test',
      publicKey: 'public-key',
      privateKey: 'private-key',
    });
  });

  it('prefers the server-only MOSPARO_* variables when both are set', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://public.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('MOSPARO_HOST', 'https://server.test');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'server-key');
    vi.stubEnv('MOSPARO_PRIVATE_KEY', 'private-key');

    expect(serverConfigFromEnv()).toMatchObject({
      host: 'https://server.test',
      publicKey: 'server-key',
    });
  });

  it('returns null without a private key', () => {
    vi.stubEnv('MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'public-key');

    expect(serverConfigFromEnv()).toBeNull();
  });

  it('never takes the private key from a NEXT_PUBLIC_ variable', () => {
    vi.stubEnv('MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PRIVATE_KEY', 'leaked-to-the-browser');

    expect(serverConfigFromEnv()).toBeNull();
  });
});
