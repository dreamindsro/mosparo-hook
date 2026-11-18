import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

interface FakeMosparoServer {
  /** Every request the widget made, in order. */
  requests: { endpoint: string; data: Record<string, string> }[];
  /** Answer to `/api/v1/frontend/request-submit-token`. */
  submitTokenResponse: Record<string, unknown>;
  /** Answer to `/api/v1/frontend/check-form-data`. */
  checkFormDataResponse: Record<string, unknown>;
  /** Answer every request with a server error. */
  down: boolean;
}

const frontendScript = readFileSync(
  join(import.meta.dirname, 'fixtures', 'mosparo-frontend.js'),
  'utf8',
  // The stylesheet import is for mosparo's own build; nothing else is changed.
).replace("import './scss/mosparo-frontend.scss';", '');

/**
 * Put the real mosparo widget on the page, the way a loaded
 * `mosparo-frontend.js` does, and answer its requests like a mosparo server
 * that accepts the form.
 */
export function installRealMosparo(): FakeMosparoServer {
  const server: FakeMosparoServer = {
    requests: [],
    submitTokenResponse: { submitToken: 'submit-token' },
    checkFormDataResponse: { valid: true, validationToken: 'validation-token' },
    down: false,
  };

  class FakeXMLHttpRequest {
    readyState = 0;
    status = 0;
    responseText = '';
    onreadystatechange: (() => void) | null = null;
    private endpoint = '';

    open(_method: string, url: string) {
      this.endpoint = new URL(url).pathname;
    }

    setRequestHeader() {}

    send(body: string) {
      server.requests.push({
        endpoint: this.endpoint,
        data: Object.fromEntries(new URLSearchParams(body)),
      });

      const response = this.endpoint.endsWith('/request-submit-token')
        ? server.submitTokenResponse
        : server.checkFormDataResponse;

      // Like a real response, this arrives in a later task.
      setTimeout(() => {
        this.readyState = 4;
        this.status = server.down ? 500 : 200;
        this.responseText = server.down ? '' : JSON.stringify(response);
        this.onreadystatechange?.();
      });
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  // The script ends with `global.mosparo = mosparo`.
  new Function('global', frontendScript)(window);

  return server;
}
