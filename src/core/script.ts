export interface LoadMosparoScriptOptions {
  /**
   * Nonce for the script tag, for pages with a Content Security Policy that
   * allows scripts by nonce.
   */
  nonce?: string;
}

const loadPromises = new Map<string, Promise<void>>();

/** URL of the frontend script of a mosparo installation. */
export function mosparoScriptUrl(host: string): string {
  return `${host.replace(/\/+$/, '')}/build/mosparo-frontend.js`;
}

/**
 * Load the frontend script of a mosparo installation, once per page. Resolves
 * when `window.mosparo` is available.
 */
export function loadMosparoScript(
  host: string,
  options: LoadMosparoScriptOptions = {},
): Promise<void> {
  if (typeof window.mosparo === 'function') return Promise.resolve();

  const url = mosparoScriptUrl(host);

  const pending = loadPromises.get(url);
  if (pending) return pending;

  const promise = new Promise<void>((resolve, reject) => {
    const fail = (script: HTMLScriptElement) => {
      // Remove the failed tag too: left in the DOM, the next call would find
      // it below and wait for a load event that never comes.
      loadPromises.delete(url);
      script.remove();
      reject(new Error(`Failed to load mosparo script from ${url}`));
    };

    // A script tag that is already on the page, e.g. added by hand
    let script = Array.from(document.scripts).find(
      (candidate) => candidate.src === url,
    );
    if (!script) {
      script = document.createElement('script');
      script.src = url;
      script.async = true;
      if (options.nonce) script.nonce = options.nonce;
      document.head.appendChild(script);
    }

    const tag = script;
    tag.addEventListener('load', () => resolve(), { once: true });
    tag.addEventListener('error', () => fail(tag), { once: true });
  });

  loadPromises.set(url, promise);
  return promise;
}
