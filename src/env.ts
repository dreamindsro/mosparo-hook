import type { MosparoConfig, MosparoServerConfig } from './types';

/**
 * Read an environment variable. `process` does not exist in every runtime
 * (a Vite build, an edge worker), and Next.js replaces each
 * `process.env.NEXT_PUBLIC_*` expression with its value at build time, so
 * every variable is read through its own closure.
 */
function read(get: () => string | undefined): string | undefined {
  try {
    return get() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Widget config from the `NEXT_PUBLIC_MOSPARO_*` variables. Only public
 * variables are read: they have the same value on the server and in the
 * browser, so both render the same markup.
 */
export function clientConfigFromEnv(): Partial<MosparoConfig> {
  return {
    host: read(() => process.env.NEXT_PUBLIC_MOSPARO_HOST),
    uuid: read(() => process.env.NEXT_PUBLIC_MOSPARO_UUID),
    publicKey: read(() => process.env.NEXT_PUBLIC_MOSPARO_PUBLIC_KEY),
  };
}

/**
 * Server config from the environment: `MOSPARO_HOST`, `MOSPARO_PUBLIC_KEY`
 * (or their `NEXT_PUBLIC_` variants) and `MOSPARO_PRIVATE_KEY`.
 */
export function serverConfigFromEnv(): MosparoServerConfig | null {
  const host =
    read(() => process.env.MOSPARO_HOST) ??
    read(() => process.env.NEXT_PUBLIC_MOSPARO_HOST);
  const publicKey =
    read(() => process.env.MOSPARO_PUBLIC_KEY) ??
    read(() => process.env.NEXT_PUBLIC_MOSPARO_PUBLIC_KEY);
  const privateKey = read(() => process.env.MOSPARO_PRIVATE_KEY);

  if (!host || !publicKey || !privateKey) return null;

  return { host, publicKey, privateKey };
}

/** Whether this is a development build. */
export function isDevelopment(): boolean {
  return read(() => process.env.NODE_ENV) !== 'production';
}
