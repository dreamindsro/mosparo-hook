'use client';

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { MosparoStatus, MosparoTokens } from '../types';
import type { MosparoHandle } from './MosparoField';

export interface UseMosparoResult extends MosparoHandle {
  /** Spread these onto the `<MosparoField>` this hook controls. */
  field: {
    ref: RefObject<MosparoHandle | null>;
    onStatusChange: (status: MosparoStatus) => void;
  };
  /** Where the widget is right now. */
  status: MosparoStatus;
  /** mosparo accepted the form as it is now; it can be submitted. */
  isVerified: boolean;
}

/**
 * Follow and control a `<MosparoField>` from the component that renders it:
 *
 * ```tsx
 * const mosparo = useMosparo();
 *
 * <form onSubmit={...}>
 *   <MosparoField {...mosparo.field} />
 *   <button disabled={mosparo.status === 'checking'}>Send</button>
 * </form>
 * ```
 */
export function useMosparo(): UseMosparoResult {
  const ref = useRef<MosparoHandle>(null);
  const [status, setStatus] = useState<MosparoStatus>('loading');

  const reset = useCallback(() => ref.current?.reset(), []);
  const check = useCallback(() => ref.current?.check(), []);
  const getTokens = useCallback(
    (): MosparoTokens | null => ref.current?.getTokens() ?? null,
    [],
  );
  const field = useMemo(() => ({ ref, onStatusChange: setStatus }), []);

  return {
    field,
    status,
    isVerified: status === 'verified',
    reset,
    check,
    getTokens,
  };
}
