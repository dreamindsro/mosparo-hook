'use client';

import { useEffect, useId, useRef } from 'react';
import { useMosparoScript } from './use-mosparo-script';
import { resolveClientConfig } from './env';
import type {
  MosparoCallbacks,
  MosparoInvisibleCallbacks,
  MosparoOptions,
} from './types';

export interface MosparoFieldProps {
  host?: string;
  uuid?: string;
  publicKey?: string;
  options?: MosparoOptions;
  callbacks?: MosparoCallbacks;
  invisibleCallbacks?: MosparoInvisibleCallbacks;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: (error: Error) => void;
}

/** The parts of a mosparo widget instance that cleanup has to reach. */
interface MosparoWidget {
  formElement?: HTMLFormElement | null;
  hpFieldElement?: HTMLElement | null;
  countdownInterval?: ReturnType<typeof setInterval> | null;
  onSubmit?: EventListener;
  options?: Record<string, unknown>;
  [member: string]: unknown;
}

const noop = () => {};

/**
 * Disconnect a widget that is being replaced or removed.
 *
 * The widget registers a submit listener on the form that blocks every submit
 * it has not checked itself. Left in place after the widget is gone, it would
 * block the form for good, so it has to be removed. The widget's other
 * listeners and pending requests cannot be removed; its methods and callbacks
 * are turned off instead, so that they no longer touch the form.
 */
function detachWidget(widget: MosparoWidget): void {
  const form = widget.formElement;
  if (form && widget.onSubmit) {
    form.removeEventListener('submit', widget.onSubmit);
  }
  form?.classList.remove('mosparo__form-with-invisible-box');
  widget.hpFieldElement?.remove();
  if (widget.countdownInterval) clearInterval(widget.countdownInterval);

  for (const key of Object.keys(widget)) {
    if (typeof widget[key] === 'function') widget[key] = noop;
  }
  for (const key of Object.keys(widget.options ?? {})) {
    if (typeof widget.options![key] === 'function') widget.options![key] = null;
  }
}

export function MosparoField({
  host: hostProp,
  uuid: uuidProp,
  publicKey: publicKeyProp,
  options,
  callbacks,
  invisibleCallbacks,
  id: idProp,
  className,
  style,
  onError,
}: MosparoFieldProps) {
  const reactId = useId();
  // React's useId produces `:r1:` — colons break CSS selectors mosparo uses internally
  const autoId = `mosparo-${reactId.replace(/:/g, '')}`;
  const containerId = idProp ?? autoId;

  // Resolve config: props > env vars
  const envConfig = resolveClientConfig();
  const host = hostProp ?? envConfig?.host;
  const uuid = uuidProp ?? envConfig?.uuid;
  const publicKey = publicKeyProp ?? envConfig?.publicKey;

  // Stable callback refs to avoid re-initializing the widget on parent re-renders
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const invisibleCallbacksRef = useRef(invisibleCallbacks);
  invisibleCallbacksRef.current = invisibleCallbacks;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const configValid = !!(host && uuid && publicKey);

  const scriptStatus = useMosparoScript(configValid ? host! : '');

  // Dev-mode warning for missing config
  useEffect(() => {
    if (!configValid && process.env.NODE_ENV !== 'production') {
      console.error(
        '[MosparoField] Missing mosparo config. Provide host/uuid/publicKey via props or NEXT_PUBLIC_MOSPARO_* environment variables.',
      );
    }
  }, [configValid]);

  // Initialize widget
  useEffect(() => {
    if (!configValid || scriptStatus !== 'ready') return;

    const container = document.getElementById(containerId);
    if (!container) return;

    const mergedOptions: Record<string, unknown> = {
      loadCssResource: true,
      ...options,
    };

    // Wire up callbacks via refs so closures stay stable
    const cbs = callbacksRef.current;
    if (cbs?.onBeforeGetFormData)
      mergedOptions.onBeforeGetFormData = (...args: unknown[]) =>
        callbacksRef.current?.onBeforeGetFormData?.(
          ...(args as [Record<string, unknown>]),
        );
    if (cbs?.onGetFormData)
      mergedOptions.onGetFormData = (...args: unknown[]) =>
        callbacksRef.current?.onGetFormData?.(
          ...(args as [Record<string, unknown>]),
        );
    if (cbs?.onGetFieldValue)
      mergedOptions.onGetFieldValue = (...args: unknown[]) =>
        callbacksRef.current?.onGetFieldValue?.(
          ...(args as [string, unknown]),
        );
    if (cbs?.onCheckForm)
      mergedOptions.onCheckForm = () =>
        callbacksRef.current?.onCheckForm?.();
    if (cbs?.onResetState)
      mergedOptions.onResetState = () =>
        callbacksRef.current?.onResetState?.();
    if (cbs?.onAbortSubmit)
      mergedOptions.onAbortSubmit = () =>
        callbacksRef.current?.onAbortSubmit?.();

    // Invisible mode callbacks
    const icbs = invisibleCallbacksRef.current;
    if (icbs?.onSwitchToInvisible)
      mergedOptions.onSwitchToInvisible = () =>
        invisibleCallbacksRef.current?.onSwitchToInvisible?.();
    if (icbs?.onValidateFormInvisible)
      mergedOptions.onValidateFormInvisible = () =>
        invisibleCallbacksRef.current?.onValidateFormInvisible?.();
    if (icbs?.onSubmitFormInvisible)
      mergedOptions.onSubmitFormInvisible = () =>
        invisibleCallbacksRef.current?.onSubmitFormInvisible?.();
    if (icbs?.doSubmitFormInvisible)
      mergedOptions.doSubmitFormInvisible = () =>
        invisibleCallbacksRef.current?.doSubmitFormInvisible?.();

    let widget: MosparoWidget | undefined;
    try {
      widget = new window.mosparo(
        containerId,
        host!,
        uuid!,
        publicKey!,
        mergedOptions,
      ) as MosparoWidget;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to initialize mosparo');
      onErrorRef.current?.(error);
      if (process.env.NODE_ENV !== 'production') {
        console.error('[MosparoField] Initialization error:', error);
      }
    }

    // Cleanup: mosparo has no destroy method, so take the widget off the form
    // and clear the container
    return () => {
      if (widget) detachWidget(widget);
      const el = document.getElementById(containerId);
      if (el) {
        el.innerHTML = '';
        el.removeAttribute('class');
      }
    };
  }, [configValid, scriptStatus, containerId, host, uuid, publicKey, options]);

  if (!configValid) return null;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <style>{`#${containerId} .mosparo__overlay { position: absolute; }`}</style>
      <div id={containerId} />
    </div>
  );
}
