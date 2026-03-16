const loadPromises = new Map<string, Promise<void>>();

export function loadMosparoScript(host: string): Promise<void> {
  const url = `${host}/build/mosparo-frontend.js`;

  const existing = loadPromises.get(url);
  if (existing) return existing;

  // Check for script tag already in the DOM (e.g. added manually)
  const found = document.querySelector<HTMLScriptElement>(
    `script[src="${url}"]`,
  );
  if (found) {
    const resolved = Promise.resolve();
    loadPromises.set(url, resolved);
    return resolved;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromises.delete(url);
      reject(new Error(`Failed to load mosparo script from ${url}`));
    };
    document.head.appendChild(script);
  });

  loadPromises.set(url, promise);
  return promise;
}
