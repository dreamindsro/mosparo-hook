import type {
  MosparoCallbacks,
  MosparoConfig,
  MosparoInvisibleCallbacks,
  MosparoOptions,
  MosparoStatus,
  MosparoTokens,
} from '../types';

/** Everything the mosparo widget can be given: options and callbacks. */
export interface MosparoWidgetOptions
  extends MosparoOptions,
    MosparoCallbacks,
    MosparoInvisibleCallbacks {}

/** A mosparo widget on the page. */
export interface MosparoWidget {
  /** Where the widget is right now. */
  getStatus(): MosparoStatus;
  /** Be told when the status changes. Returns a function that stops it. */
  subscribe(listener: (status: MosparoStatus) => void): () => void;
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
  /** Take the widget off the form and empty its container. */
  destroy(): void;
}

/** The parts of mosparo's widget object that are used here. */
interface MosparoInstance {
  formElement?: HTMLFormElement | null;
  hpFieldElement?: HTMLElement | null;
  loaderContainerElement?: HTMLElement | null;
  countdownInterval?: ReturnType<typeof setInterval> | null;
  onSubmit?: EventListener;
  options?: Record<string, unknown>;
  resetState?: () => void;
  requestSubmitToken?: () => void;
  checkForm?: () => void;
  getSubmitToken?: () => string | null;
  getValidationToken?: () => string | null;
  [member: string]: unknown;
}

const noop = () => {};

let nextContainerId = 0;

/**
 * Submit a form that mosparo checked in invisible mode. mosparo itself clicks
 * the first submit button, which does nothing while that button is disabled,
 * or calls `form.submit()`, which skips submit handlers. `requestSubmit()`
 * does neither.
 */
function submitCheckedForm(form: HTMLFormElement): void {
  const button = form.querySelector<HTMLElement>(
    'button[type="submit"]:not(:disabled), input[type="submit"]:not(:disabled)',
  );
  if (button) form.requestSubmit(button);
  else form.requestSubmit();
}

/**
 * Disconnect a widget that is being replaced or removed.
 *
 * The widget registers a submit listener on the form that blocks every submit
 * it has not checked itself. Left in place after the widget is gone, it would
 * block the form for good, so it has to be removed. The widget's other
 * listeners and pending requests cannot be removed; its methods and callbacks
 * are turned off instead, so that they no longer touch the form.
 */
function detach(instance: MosparoInstance): void {
  const form = instance.formElement;
  if (form && instance.onSubmit) {
    form.removeEventListener('submit', instance.onSubmit);
  }
  form?.classList.remove('mosparo__form-with-invisible-box');
  instance.hpFieldElement?.remove();
  if (instance.countdownInterval) clearInterval(instance.countdownInterval);

  for (const key of Object.keys(instance)) {
    if (typeof instance[key] === 'function') instance[key] = noop;
  }
  const options = instance.options ?? {};
  for (const key of Object.keys(options)) {
    if (typeof options[key] === 'function') options[key] = null;
  }
}

/**
 * Create a mosparo widget in `container`, which has to be inside the form it
 * protects. mosparo's frontend script must be loaded first, see
 * `loadMosparoScript()`.
 */
export function createMosparoWidget(
  container: HTMLElement,
  config: MosparoConfig,
  options: MosparoWidgetOptions = {},
): MosparoWidget {
  const Mosparo = window.mosparo;
  if (typeof Mosparo !== 'function') {
    throw new Error(
      'The mosparo script is not loaded. Call loadMosparoScript() first.',
    );
  }

  const form = container.closest('form');
  if (!form) {
    throw new Error(
      'The mosparo widget has to be inside the <form> it protects.',
    );
  }

  if (!container.id) container.id = `mosparo-${++nextContainerId}`;

  // mosparo tells "not set" from "set" by comparing with null, so options
  // that are undefined must not be passed on.
  const widgetOptions: Record<string, unknown> = {
    loadCssResource: true,
    doSubmitFormInvisible: () => submitCheckedForm(form),
  };
  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined) widgetOptions[name] = value;
  }

  // mosparo announces only the end of a check. Its container's classes show
  // the rest, and this event, sent right before the form data goes out, tells
  // a check from the token request.
  let checking = false;
  const onCollectRequestData = () => {
    checking = true;
  };
  form.addEventListener('collect-request-data', onCollectRequestData);

  let instance: MosparoInstance;
  try {
    instance = new Mosparo(
      container.id,
      config.host.replace(/\/+$/, ''),
      config.uuid,
      config.publicKey,
      widgetOptions,
    ) as MosparoInstance;
  } catch (error) {
    form.removeEventListener('collect-request-data', onCollectRequestData);
    throw error;
  }

  const readStatus = (): MosparoStatus => {
    const classes = container.classList;
    if (classes.contains('mosparo__loading')) {
      return checking ? 'checking' : 'loading';
    }
    checking = false;
    if (classes.contains('mosparo__checked')) return 'verified';
    if (classes.contains('mosparo__invalid')) {
      // Without a submit token the widget cannot check anything.
      return instance.getSubmitToken?.() ? 'invalid' : 'error';
    }
    return 'ready';
  };

  let status = readStatus();
  const listeners = new Set<(status: MosparoStatus) => void>();
  const observer = new MutationObserver(() => {
    const next = readStatus();
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener(status);
  });
  observer.observe(container, { attributes: true, attributeFilter: ['class'] });

  let destroyed = false;

  return {
    getStatus: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reset() {
      if (destroyed) return;
      // In invisible mode every token request adds another loader.
      instance.loaderContainerElement?.remove();
      instance.resetState?.();
      instance.requestSubmitToken?.();
    },

    check() {
      if (destroyed) return;
      instance.checkForm?.();
    },

    getTokens() {
      const submitToken = instance.getSubmitToken?.();
      const validationToken = instance.getValidationToken?.();
      if (destroyed || !submitToken || !validationToken) return null;
      return { submitToken, validationToken };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;

      observer.disconnect();
      listeners.clear();
      form.removeEventListener('collect-request-data', onCollectRequestData);
      detach(instance);

      container.replaceChildren();
      container.removeAttribute('lang');
      for (const name of Array.from(container.classList)) {
        if (name.startsWith('mosparo__')) container.classList.remove(name);
      }
    },
  };
}
