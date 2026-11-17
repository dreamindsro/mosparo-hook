import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveClientConfig, resolveServerConfig } from '../src/env';
import { clearMosparoEnv } from './helpers';

beforeEach(clearMosparoEnv);

describe('resolveClientConfig', () => {
  it('reads the NEXT_PUBLIC_MOSPARO_* variables', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');

    expect(resolveClientConfig()).toEqual({
      host: 'https://mosparo.test',
      uuid: 'project-uuid',
      publicKey: 'public-key',
    });
  });

  it('falls back to the unprefixed MOSPARO_* variables', () => {
    vi.stubEnv('MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'public-key');

    expect(resolveClientConfig()).toEqual({
      host: 'https://mosparo.test',
      uuid: 'project-uuid',
      publicKey: 'public-key',
    });
  });

  it('prefers NEXT_PUBLIC_MOSPARO_* when both are set', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://public.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'public-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('MOSPARO_HOST', 'https://server.test');
    vi.stubEnv('MOSPARO_UUID', 'server-uuid');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'server-key');

    expect(resolveClientConfig()).toEqual({
      host: 'https://public.test',
      uuid: 'public-uuid',
      publicKey: 'public-key',
    });
  });

  it.each(['HOST', 'UUID', 'PUBLIC_KEY'])(
    'returns null when %s is not set',
    (missing) => {
      vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://mosparo.test');
      vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'project-uuid');
      vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');
      vi.stubEnv(`NEXT_PUBLIC_MOSPARO_${missing}`, undefined);

      expect(resolveClientConfig()).toBeNull();
    },
  );
});

describe('resolveServerConfig', () => {
  it('works with the setup from the README: public values plus a private key', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('MOSPARO_PRIVATE_KEY', 'private-key');

    expect(resolveServerConfig()).toEqual({
      host: 'https://mosparo.test',
      uuid: 'project-uuid',
      publicKey: 'public-key',
      privateKey: 'private-key',
      verifySsl: true,
    });
  });

  it('prefers the server-only MOSPARO_* variables when both are set', () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://public.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'public-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('MOSPARO_HOST', 'https://server.test');
    vi.stubEnv('MOSPARO_UUID', 'server-uuid');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'server-key');
    vi.stubEnv('MOSPARO_PRIVATE_KEY', 'private-key');

    expect(resolveServerConfig()).toMatchObject({
      host: 'https://server.test',
      uuid: 'server-uuid',
      publicKey: 'server-key',
    });
  });

  it('returns null without a private key', () => {
    vi.stubEnv('MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'public-key');

    expect(resolveServerConfig()).toBeNull();
  });

  it('never takes the private key from a NEXT_PUBLIC_ variable', () => {
    vi.stubEnv('MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PRIVATE_KEY', 'leaked-to-the-browser');

    expect(resolveServerConfig()).toBeNull();
  });

  it('turns verifySsl off only for MOSPARO_VERIFY_SSL=false', () => {
    vi.stubEnv('MOSPARO_HOST', 'https://mosparo.test');
    vi.stubEnv('MOSPARO_UUID', 'project-uuid');
    vi.stubEnv('MOSPARO_PUBLIC_KEY', 'public-key');
    vi.stubEnv('MOSPARO_PRIVATE_KEY', 'private-key');

    vi.stubEnv('MOSPARO_VERIFY_SSL', 'false');
    expect(resolveServerConfig()?.verifySsl).toBe(false);

    vi.stubEnv('MOSPARO_VERIFY_SSL', '0');
    expect(resolveServerConfig()?.verifySsl).toBe(true);
  });
});
