import { useEffect, useState } from 'react';
import { loadMosparoScript } from './script-loader';

type ScriptStatus = 'loading' | 'ready' | 'error';

export function useMosparoScript(host: string): ScriptStatus {
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

    loadMosparoScript(host).then(
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
  }, [host]);

  return status;
}
