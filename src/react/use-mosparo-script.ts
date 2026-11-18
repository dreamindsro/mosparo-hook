import { useEffect, useState } from 'react';
import { loadMosparoScript } from '../core/script';

type ScriptStatus = 'loading' | 'ready' | 'error';

/** Load mosparo's frontend script from `host` and report how far it is. */
export function useMosparoScript(
  host: string | undefined,
  nonce?: string,
): ScriptStatus {
  const [status, setStatus] = useState<ScriptStatus>(() => {
    if (typeof window === 'undefined') return 'loading';
    if (typeof window.mosparo === 'function') return 'ready';
    return 'loading';
  });

  useEffect(() => {
    // No host means the field has no usable config; there is nothing to load.
    if (!host) return;

    if (typeof window.mosparo === 'function') {
      setStatus('ready');
      return;
    }

    let cancelled = false;

    loadMosparoScript(host, { nonce }).then(
      () => {
        if (!cancelled) setStatus('ready');
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );

    return () => {
      cancelled = true;
    };
  }, [host, nonce]);

  return status;
}
