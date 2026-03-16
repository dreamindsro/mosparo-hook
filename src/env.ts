import type { MosparoConfig, MosparoServerConfig } from './types';

export function resolveClientConfig(): MosparoConfig | null {
  const host =
    process.env.NEXT_PUBLIC_MOSPARO_HOST ?? process.env.MOSPARO_HOST;
  const uuid =
    process.env.NEXT_PUBLIC_MOSPARO_UUID ?? process.env.MOSPARO_UUID;
  const publicKey =
    process.env.NEXT_PUBLIC_MOSPARO_PUBLIC_KEY ??
    process.env.MOSPARO_PUBLIC_KEY;

  if (!host || !uuid || !publicKey) return null;

  return { host, uuid, publicKey };
}

export function resolveServerConfig(): MosparoServerConfig | null {
  const host = process.env.MOSPARO_HOST;
  const uuid = process.env.MOSPARO_UUID;
  const publicKey = process.env.MOSPARO_PUBLIC_KEY;
  const privateKey = process.env.MOSPARO_PRIVATE_KEY;

  if (!host || !uuid || !publicKey || !privateKey) return null;

  const verifySsl = process.env.MOSPARO_VERIFY_SSL !== 'false';

  return { host, uuid, publicKey, privateKey, verifySsl };
}
