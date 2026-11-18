'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from 'react';
import { mosparoScriptUrl } from '../core/script';
import {
  createMosparoWidget,
  type MosparoWidget,
  type MosparoWidgetOptions,
} from '../core/widget';
import { clientConfigFromEnv, isDevelopment } from '../env';
import type {
  MosparoCallbacks,
  MosparoInvisibleCallbacks,
  MosparoOptions,
  MosparoStatus,
  MosparoTokens,
} from '../types';
import { useMosparoScript } from './use-mosparo-script';

export interface MosparoFieldProps {
  /** URL of the mosparo installation. Default: `NEXT_PUBLIC_MOSPARO_HOST`. */
  host?: string;
  /** UUID of the mosparo project. Default: `NEXT_PUBLIC_MOSPARO_UUID`. */
  uuid?: string;
  /** Public key of the project. Default: `NEXT_PUBLIC_MOSPARO_PUBLIC_KEY`. */
  publicKey?: string;
  /** Options of the mosparo widget. */
  options?: MosparoOptions;
  callbacks?: MosparoCallbacks;
  invisibleCallbacks?: MosparoInvisibleCallbacks;
  /** Called whenever the status of the widget changes. */
  onStatusChange?: (status: MosparoStatus) => void;
  /** Called when the script cannot be loaded or the widget cannot start. */
  onError?: (error: Error) => void;
  /** Nonce for the script tag, for a Content Security Policy with nonces. */
  nonce?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

/** What a ref on `<MosparoField>` gives access to. */
export interface MosparoHandle {
  /**
   * Start over: clear the check and fetch a new submit token. Call it after
   * every submit that leaves the form on the page, because mosparo accepts
   * each token once.
   */
  reset(): void;
  /** Have mosparo check the form now, as if the visitor ticked the box. */
  check(): void;
  /** The tokens of the checked form, or `null` while it is not checked. */
  getTokens(): MosparoTokens | null;
}

/**
 * The mosparo box. Render it inside the form it protects.
 */
export const MosparoField = forwardRef<MosparoHandle, MosparoFieldProps>(
  function MosparoField(
    {
      host: hostProp,
      uuid: uuidProp,
      publicKey: publicKeyProp,
      options,
      callbacks,
      invisibleCallbacks,
      onStatusChange,
      onError,
      nonce,
      id: idProp,
      className,
      style,
    },
    ref,
  ) {
    const reactId = useId();
    // mosparo finds its container by id. React's ids contain characters that
    // are not valid in the selectors mosparo builds from it.
    const containerId = idProp ?? `mosparo-${reactId.replace(/[^\w-]/g, '')}`;

    const env = clientConfigFromEnv();
    const host = hostProp ?? env.host;
    const uuid = uuidProp ?? env.uuid;
    const publicKey = publicKeyProp ?? env.publicKey;
    const configValid = !!(host && uuid && publicKey);

    // The widget is created once and calls whatever the latest render passed.
    const latest = useRef({ callbacks, invisibleCallbacks, onStatusChange, onError });
    latest.current = { callbacks, invisibleCallbacks, onStatusChange, onError };

    const containerRef = useRef<HTMLDivElement>(null);
    const widgetRef = useRef<MosparoWidget | null>(null);
    const reportedStatus = useRef<MosparoStatus>('loading');

    const report = (status: MosparoStatus) => {
      if (reportedStatus.current === status) return;
      reportedStatus.current = status;
      latest.current.onStatusChange?.(status);
    };
    const reportRef = useRef(report);
    reportRef.current = report;

    const scriptStatus = useMosparoScript(configValid ? host : '', nonce);

    useEffect(() => {
      if (configValid) return;
      reportRef.current('error');
      if (isDevelopment()) {
        console.error(
          '[MosparoField] Missing mosparo config. Pass host, uuid and publicKey as props or set the NEXT_PUBLIC_MOSPARO_* environment variables.',
        );
      }
    }, [configValid]);

    useEffect(() => {
      if (scriptStatus !== 'error' || !host) return;
      reportRef.current('error');
      latest.current.onError?.(
        new Error(`Failed to load mosparo script from ${mosparoScriptUrl(host)}`),
      );
    }, [scriptStatus, host]);

    // Options are compared by value, so that an options object written inline
    // does not replace the widget, and with it the visitor's check, on every
    // render.
    const optionsKey = JSON.stringify(options ?? {});
    // These two callbacks replace a part of mosparo's own flow, so the widget
    // has to know whether they exist.
    const handlesStoredData = !!callbacks?.onFormDataStored;
    const handlesValidData = !!callbacks?.onFormDataValid;

    useEffect(() => {
      const container = containerRef.current;
      if (!configValid || scriptStatus !== 'ready' || !container) return;

      const current = () => latest.current.callbacks;
      const currentInvisible = () => latest.current.invisibleCallbacks;

      const widgetOptions: MosparoWidgetOptions = {
        ...(JSON.parse(optionsKey) as MosparoOptions),
        onBeforeGetFormData: (form) => current()?.onBeforeGetFormData?.(form),
        onGetFormData: (form, formData) =>
          current()?.onGetFormData?.(form, formData) ?? formData,
        onGetFieldValue: (field, value) => {
          const onGetFieldValue = current()?.onGetFieldValue;
          return onGetFieldValue ? onGetFieldValue(field, value) : value;
        },
        onCheckForm: (valid) => current()?.onCheckForm?.(valid),
        onResetState: () => current()?.onResetState?.(),
        onAbortSubmit: () => current()?.onAbortSubmit?.(),
        onSwitchToInvisible: () => currentInvisible()?.onSwitchToInvisible?.(),
        onValidateFormInvisible: () =>
          currentInvisible()?.onValidateFormInvisible?.(),
        onSubmitFormInvisible: () =>
          currentInvisible()?.onSubmitFormInvisible?.(),
      };
      if (handlesStoredData) {
        widgetOptions.onFormDataStored = () => current()?.onFormDataStored?.();
      }
      if (handlesValidData) {
        widgetOptions.onFormDataValid = () => current()?.onFormDataValid?.();
      }
      if (currentInvisible()?.doSubmitFormInvisible) {
        widgetOptions.doSubmitFormInvisible = () =>
          currentInvisible()?.doSubmitFormInvisible?.();
      }

      let widget: MosparoWidget;
      try {
        widget = createMosparoWidget(
          container,
          { host: host!, uuid: uuid!, publicKey: publicKey! },
          widgetOptions,
        );
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to initialize mosparo');
        reportRef.current('error');
        latest.current.onError?.(error);
        if (isDevelopment()) {
          console.error('[MosparoField] Initialization error:', error);
        }
        return;
      }

      widgetRef.current = widget;
      reportRef.current(widget.getStatus());
      const unsubscribe = widget.subscribe((status) => reportRef.current(status));

      // mosparo has no destroy method, so the widget is taken off the form
      // and its container emptied.
      return () => {
        unsubscribe();
        widget.destroy();
        widgetRef.current = null;
      };
    }, [
      configValid,
      scriptStatus,
      host,
      uuid,
      publicKey,
      optionsKey,
      handlesStoredData,
      handlesValidData,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => widgetRef.current?.reset(),
        check: () => widgetRef.current?.check(),
        getTokens: () => widgetRef.current?.getTokens() ?? null,
      }),
      [],
    );

    if (!configValid) return null;

    return (
      <div
        className={className}
        style={{ position: 'relative', overflow: 'hidden', ...style }}
      >
        <div id={containerId} ref={containerRef} />
      </div>
    );
  },
);
