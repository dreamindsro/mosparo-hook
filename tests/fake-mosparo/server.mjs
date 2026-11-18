// A small stand-in for a mosparo server, for tests only.
//
// It serves mosparo's own frontend script (tests/fixtures) and answers the
// three requests a form protected by mosparo makes: the widget asks for a
// submit token and has the form data checked, then the backend has the
// submission verified. The rules follow mosparo's FrontendApiController,
// VerificationApiController and VerificationHelper: tokens are single-use,
// requests are signed with the project's private key, and only the fields the
// widget collected are verified.
//
// Plain JavaScript, so that the end-to-end tests can start it with `node`.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The one project this server knows. */
export const project = {
  uuid: 'test-project-uuid',
  publicKey: 'test-public-key',
  privateKey: 'test-private-key',
};

const VERIFY_ENDPOINT = '/api/v1/verification/verify';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

// The script is mosparo's source file. Its build drops the stylesheet import
// and provides `global`; nothing else is changed here.
const frontendScript = `(function (global) {\n${readFileSync(
  join(fixtures, 'mosparo-frontend.js'),
  'utf8',
).replace("import './scss/mosparo-frontend.scss';", '')}\n})(window);`;

// Enough of mosparo's stylesheet to hide the box in invisible mode.
const stylesheet = `
.mosparo__container { font-family: sans-serif; }
.mosparo__form-with-invisible-box .mosparo__container .mosparo__row { display: none; }
.mosparo__loader-container { display: none; }
.mosparo__loader-container.mosparo__loader-visible { display: block; }
.mosparo__error-message { display: none; }
.mosparo__error-message.mosparo__error-message-visible { display: block; }
`;

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const hmac = (value) =>
  createHmac('sha256', project.privateKey).update(value).digest('hex');
// mosparo signs JSON in which empty arrays are written as empty objects.
const toJson = (value) => JSON.stringify(value).replace(/\[]/g, '{}');
const token = () => randomBytes(24).toString('hex');

function defaultSettings() {
  return {
    /** Tell the widget to hide its box and check the form on submit. */
    invisible: false,
    /** Name of the honeypot field the widget adds, or null for none. */
    honeypotFieldName: null,
    /** A form containing this text is treated as spam. */
    spamText: 'buy cheap pills',
    /** Answer the token request with an error, like a wrong public key. */
    refuseTokens: false,
    /** Wait this long before answering a verification request. */
    verifyDelayMs: 0,
    /**
     * Fail every verification, the way mosparo does for a submission that
     * breaks one of its security rules (minimum time, equal submissions).
     */
    failVerification: false,
  };
}

/**
 * Compare a value the widget sent with the hash the backend sent, the way
 * mosparo's VerificationHelper does.
 */
function valuesMatch(seen, received) {
  if (Array.isArray(seen) && isCollection(received)) {
    const hashes = Object.values(received).map((hash) =>
      typeof hash === 'string' ? hash.toLowerCase() : hash,
    );
    return seen.every((item, index) =>
      Array.isArray(item) && received[index] !== undefined
        ? valuesMatch(item, received[index])
        : hashes.includes(sha256(item)),
    );
  }
  if (!Array.isArray(seen) && !isCollection(received)) {
    return typeof received === 'string' && sha256(seen) === received.toLowerCase();
  }
  return false;
}

const isCollection = (value) => typeof value === 'object' && value !== null;

export function createFakeMosparo() {
  const state = {
    settings: defaultSettings(),
    /** Every API request received, in order. */
    requests: [],
    /** Submit token → { verified, submission }. */
    tokens: new Map(),
  };

  function requestSubmitToken(data) {
    if (data.publicKey !== project.publicKey || state.settings.refuseTokens) {
      return { error: true, errorMessage: 'No project available.' };
    }
    if (data.pageTitle === undefined || data.pageUrl === undefined) {
      return { error: true, errorMessage: 'Required parameters missing.' };
    }
    if (data.submitToken) {
      const existing = state.tokens.get(data.submitToken);
      if (!existing || existing.verified) {
        return {
          error: true,
          errorMessage:
            'The given submit token does not exist or has already been used.',
        };
      }
    }

    const submitToken = token();
    state.tokens.set(submitToken, { verified: false, submission: null });

    const response = { submitToken, invisible: state.settings.invisible };
    if (state.settings.honeypotFieldName) {
      response.honeypotFieldName = state.settings.honeypotFieldName;
    }
    return response;
  }

  function checkFormData(data) {
    const entry = state.tokens.get(data.submitToken);
    if (data.publicKey !== project.publicKey || !entry || entry.verified) {
      return { error: true, errorMessage: 'Submit token not valid.' };
    }

    let formData;
    try {
      formData = JSON.parse(data.formData);
    } catch {
      return { error: true, errorMessage: 'Form data not valid.' };
    }

    const fields = (formData.fields ?? []).map((field) =>
      field.name === state.settings.honeypotFieldName
        ? { ...field, type: 'honeypot' }
        : field,
    );
    const honeypot = fields.find((field) => field.type === 'honeypot');
    const isSpam =
      (honeypot && honeypot.value !== '') ||
      JSON.stringify(fields).includes(state.settings.spamText);

    if (isSpam) {
      entry.submission = null;
      return { valid: false };
    }

    const validationToken = token();
    entry.submission = {
      fields,
      ignoredFields: formData.ignoredFields ?? [],
      validationToken,
    };
    return { valid: true, validationToken };
  }

  function verify(body) {
    const fail = (errorMessage) => ({ error: true, errorMessage });

    if (
      typeof body.submitToken !== 'string' ||
      typeof body.validationSignature !== 'string' ||
      typeof body.formSignature !== 'string'
    ) {
      return fail('Required parameter missing.');
    }

    const entry = state.tokens.get(body.submitToken);
    if (!entry || entry.verified) {
      return fail('Submit token not found or not valid.');
    }
    if (!entry.submission) return fail('Submission does not exist.');

    const formData = body.formData ?? {};
    if (!isCollection(formData)) return fail('Form data invalid.');

    // A submit token can be verified once.
    entry.verified = true;

    if (state.settings.failVerification) return fail('Verification failed.');

    if (hmac(toJson(formData)) !== body.formSignature) {
      return fail('Verification failed.');
    }
    if (hmac(entry.submission.validationToken) !== body.validationSignature) {
      return fail('Verification failed.');
    }

    // Only the fields the widget collected are verified. Anything else the
    // backend sends is ignored.
    const verifiedFields = {};
    const issues = [];
    for (const field of entry.submission.fields) {
      if (field.type === 'honeypot') continue;

      const received = formData[field.name];
      if (received === undefined || received === null) {
        issues.push({
          name: field.name,
          message: 'Missing in form data, verification not possible.',
        });
        verifiedFields[field.name] = 'invalid';
      } else if (!valuesMatch(field.value ?? '', received)) {
        issues.push({ name: field.name, message: 'Field not valid.' });
        verifiedFields[field.name] = 'invalid';
      } else {
        verifiedFields[field.name] = 'valid';
      }
    }

    const valid = issues.length === 0;
    return {
      valid,
      verificationSignature: valid
        ? hmac(body.validationSignature + body.formSignature)
        : '',
      verifiedFields,
      issues,
    };
  }

  function isSignedByBackend(request, rawBody) {
    const header = request.headers.authorization ?? '';
    const [username, signature] = Buffer.from(
      header.replace(/^Basic /, ''),
      'base64',
    )
      .toString()
      .split(':');

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return false;
    }
    return (
      username === project.publicKey &&
      signature === hmac(VERIFY_ENDPOINT + toJson(body))
    );
  }

  async function handle(request, response) {
    const { pathname } = new URL(request.url, 'http://fake-mosparo');
    const send = (status, body, type = 'application/json') => {
      response.writeHead(status, {
        'Content-Type': type,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      response.end(typeof body === 'string' ? body : JSON.stringify(body));
    };

    if (request.method === 'OPTIONS') return send(204, '');

    if (request.method === 'GET') {
      if (pathname === '/build/mosparo-frontend.js') {
        return send(200, frontendScript, 'text/javascript');
      }
      if (pathname === `/resources/${project.uuid}.css`) {
        return send(200, stylesheet, 'text/css');
      }
      if (pathname === '/__control') {
        return send(200, { settings: state.settings, requests: state.requests });
      }
      return send(404, { error: true });
    }

    let rawBody = '';
    for await (const chunk of request) rawBody += chunk;

    // Test control: change settings, or start over.
    if (pathname === '/__control') {
      Object.assign(state.settings, JSON.parse(rawBody || '{}'));
      return send(200, state.settings);
    }
    if (pathname === '/__control/reset') {
      state.settings = defaultSettings();
      state.requests.length = 0;
      state.tokens.clear();
      return send(200, state.settings);
    }

    if (pathname === VERIFY_ENDPOINT) {
      let fields = [];
      try {
        fields = Object.keys(JSON.parse(rawBody).formData ?? {});
      } catch {
        // Answered below as an unsigned request.
      }
      state.requests.push({ endpoint: pathname, fields });
      if (state.settings.verifyDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, state.settings.verifyDelayMs),
        );
      }
      if (!isSignedByBackend(request, rawBody)) {
        return send(401, { error: true, errorMessage: 'Unauthorized.' });
      }
      return send(200, verify(JSON.parse(rawBody)));
    }

    const data = Object.fromEntries(new URLSearchParams(rawBody));
    state.requests.push({ endpoint: pathname, data });

    if (pathname === '/api/v1/frontend/request-submit-token') {
      return send(200, requestSubmitToken(data));
    }
    if (pathname === '/api/v1/frontend/check-form-data') {
      return send(200, checkFormData(data));
    }
    return send(404, { error: true });
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      response.writeHead(500);
      response.end(String(error));
    });
  });

  return {
    /** Settings a test can change while the server runs. */
    get settings() {
      return state.settings;
    },
    requests: state.requests,
    /** Forget all tokens and requests and restore the default settings. */
    reset() {
      state.settings = defaultSettings();
      state.requests.length = 0;
      state.tokens.clear();
    },
    /** Start listening. Resolves with the server's base URL. */
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
          resolve(`http://127.0.0.1:${server.address().port}`);
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      });
    },
  };
}

// `node tests/fake-mosparo/server.mjs [port]` runs it on its own.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = await createFakeMosparo().listen(Number(process.argv[2] ?? 4310));
  console.log(`Fake mosparo server listening on ${url}`);
}
