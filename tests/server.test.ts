// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifySubmission } from '../src/server';
import { createFakeMosparo, project } from './fake-mosparo/server.mjs';
import { clearMosparoEnv } from './helpers';

// Nothing is mocked here: verifySubmission talks over HTTP, through the real
// @mosparo/api-client, to a stand-in mosparo server that signs and verifies
// like mosparo does.

const mosparo = createFakeMosparo();
let config: { host: string; publicKey: string; privateKey: string };

beforeAll(async () => {
  const host = await mosparo.listen();
  config = { host, publicKey: project.publicKey, privateKey: project.privateKey };
});

afterAll(() => mosparo.close());

beforeEach(() => {
  clearMosparoEnv();
  mosparo.reset();
});

async function post(endpoint: string, data: Record<string, string>) {
  const response = await fetch(config.host + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...data, publicKey: project.publicKey }),
  });
  return response.json();
}

/**
 * What the widget does in the browser: fetch a submit token, then have
 * mosparo check the fields it read. Returns the two tokens it adds to the form.
 */
async function widgetChecks(fields: Record<string, unknown>) {
  const { submitToken } = await post('/api/v1/frontend/request-submit-token', {
    pageTitle: 'Contact',
    pageUrl: 'https://example.test/contact',
  });
  const { validationToken } = await post('/api/v1/frontend/check-form-data', {
    submitToken,
    formData: JSON.stringify({
      fields: Object.entries(fields).map(([name, value]) => ({
        name,
        value,
        fieldPath: `input[text].${name}`,
      })),
      ignoredFields: [],
    }),
  });

  return {
    _mosparo_submitToken: submitToken as string,
    _mosparo_validationToken: validationToken as string,
  };
}

/** The field names the backend sent to mosparo for verification. */
const fieldsSentToMosparo = () =>
  mosparo.requests.find((request) => request.fields)?.fields;

const verifyRequests = () =>
  mosparo.requests.filter((request) => request.fields);

describe('verifySubmission', () => {
  describe('with a submission the widget checked', () => {
    it('is valid, and names the verified fields', async () => {
      const form = { name: 'Ada', email: 'ada@example.com' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission({ ...form, ...tokens }, { config });

      expect(result).toEqual({
        valid: true,
        verifiedFields: { name: 'valid', email: 'valid' },
        issues: [],
      });
    });

    it('accepts FormData, and leaves uploaded files out', async () => {
      const tokens = await widgetChecks({ name: 'Ada' });
      const formData = new FormData();
      formData.set('name', 'Ada');
      formData.set('attachment', new File(['%PDF'], 'cv.pdf'));
      for (const [name, value] of Object.entries(tokens)) formData.set(name, value);

      const result = await verifySubmission(formData, { config });

      expect(result.valid).toBe(true);
      expect(fieldsSentToMosparo()).toEqual(['name']);
    });

    it('accepts a Request with a form body, and leaves it readable', async () => {
      const tokens = await widgetChecks({ name: 'Ada' });
      const request = new Request('https://example.test/contact', {
        method: 'POST',
        body: new URLSearchParams({ name: 'Ada', ...tokens }),
      });

      const result = await verifySubmission(request, { config });

      expect(result.valid).toBe(true);
      expect((await request.formData()).get('name')).toBe('Ada');
    });

    it('accepts a Request with a JSON body', async () => {
      const tokens = await widgetChecks({ name: 'Ada' });
      const request = new Request('https://example.test/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ada', ...tokens }),
      });

      const result = await verifySubmission(request, { config });

      expect(result.valid).toBe(true);
    });

    it('accepts the line endings a browser submits for a textarea', async () => {
      // The widget reads "\n" from the field; the submitted form has "\r\n".
      const tokens = await widgetChecks({ message: 'Hello\nAda' });

      const result = await verifySubmission(
        { message: 'Hello\r\nAda', ...tokens },
        { config },
      );

      expect(result.valid).toBe(true);
    });

    it('verifies a field whose name starts with an underscore', async () => {
      const form = { _subject: 'Hello' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission({ ...form, ...tokens }, { config });

      expect(result).toMatchObject({
        valid: true,
        verifiedFields: { _subject: 'valid' },
      });
    });

    it('verifies several fields with one name as a list', async () => {
      const tokens = await widgetChecks({ phone: ['111', '222'], tags: ['a'] });
      const formData = new FormData();
      formData.append('phone', '111');
      formData.append('phone', '222');
      formData.append('tags[]', 'a');
      for (const [name, value] of Object.entries(tokens)) formData.set(name, value);

      const result = await verifySubmission(formData, { config });

      expect(result).toMatchObject({
        valid: true,
        verifiedFields: { phone: 'valid', tags: 'valid' },
      });
    });
  });

  describe('fields the widget does not read', () => {
    it('do not make the verification fail, and are not verified', async () => {
      const tokens = await widgetChecks({ name: 'Ada' });

      const result = await verifySubmission(
        { name: 'Ada', consent: 'on', newsletter: true, ...tokens },
        { config },
      );

      expect(result).toMatchObject({
        valid: true,
        verifiedFields: { name: 'valid' },
      });
    });

    it('are kept away from mosparo when listed in ignoredFields', async () => {
      const tokens = await widgetChecks({ name: 'Ada' });

      const result = await verifySubmission(
        { name: 'Ada', password: 'hunter2', csrfToken: 'abc', ...tokens },
        { config, ignoredFields: ['password', 'csrfToken'] },
      );

      expect(result.valid).toBe(true);
      expect(fieldsSentToMosparo()).toEqual(['name']);
    });

    it("never include the widget's own fields or React's action fields", async () => {
      const tokens = await widgetChecks({ name: 'Ada' });

      await verifySubmission(
        {
          name: 'Ada',
          _mosparo_checkboxField: 'on',
          $ACTION_ID_4f2a: '',
          $ACTION_KEY: 'k1',
          ...tokens,
        },
        { config },
      );

      expect(fieldsSentToMosparo()).toEqual(['name']);
    });
  });

  describe('requiredFields', () => {
    it('reject a submission in which a required field was kept from the widget', async () => {
      // A bot turned the message into a field type the widget skips, so
      // mosparo's rules never saw it.
      const tokens = await widgetChecks({ name: 'Ada' });

      const result = await verifySubmission(
        { name: 'Ada', message: 'buy cheap pills', ...tokens },
        { config, requiredFields: ['name', 'message'] },
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'unverified-field',
        message: 'Not verified by mosparo: message.',
        verifiedFields: { name: 'valid' },
      });
    });

    it('accept a submission in which mosparo verified every required field', async () => {
      const form = { name: 'Ada', message: 'Hello' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission(
        { ...form, ...tokens },
        { config, requiredFields: ['name', 'message'] },
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('with a submission mosparo does not accept', () => {
    it('rejects a field that was changed after the check', async () => {
      const tokens = await widgetChecks({ name: 'Ada', email: 'ada@example.com' });

      const result = await verifySubmission(
        { name: 'Ada', email: 'mallory@example.com', ...tokens },
        { config },
      );

      expect(result).toEqual({
        valid: false,
        code: 'rejected',
        message: 'Field not valid.',
        // The API client only passes the field results on for a valid submission.
        verifiedFields: {},
        issues: [{ name: 'email', message: 'Field not valid.' }],
      });
    });

    it('rejects a submission that lacks a field the widget read', async () => {
      const tokens = await widgetChecks({ name: 'Ada', email: 'ada@example.com' });

      const result = await verifySubmission({ name: 'Ada', ...tokens }, { config });

      expect(result).toMatchObject({
        valid: false,
        code: 'rejected',
        issues: [
          {
            name: 'email',
            message: 'Missing in form data, verification not possible.',
          },
        ],
      });
    });

    it('rejects tokens that were used before', async () => {
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);
      const first = await verifySubmission({ ...form, ...tokens }, { config });

      const second = await verifySubmission({ ...form, ...tokens }, { config });

      expect(first.valid).toBe(true);
      expect(second).toMatchObject({
        valid: false,
        code: 'rejected',
        message: 'Submit token not found or not valid.',
      });
    });

    it('rejects tokens mosparo never issued', async () => {
      const result = await verifySubmission(
        {
          name: 'Ada',
          _mosparo_submitToken: 'made-up',
          _mosparo_validationToken: 'made-up',
        },
        { config },
      );

      expect(result).toMatchObject({ valid: false, code: 'rejected' });
    });
  });

  describe('when the verification cannot be done', () => {
    it.each(['_mosparo_submitToken', '_mosparo_validationToken'] as const)(
      'fails without asking mosparo when %s is missing',
      async (missingToken) => {
        const { [missingToken]: _removed, ...incomplete } = {
          name: 'Ada',
          ...(await widgetChecks({ name: 'Ada' })),
        };

        const result = await verifySubmission(incomplete, { config });

        expect(result).toMatchObject({
          valid: false,
          code: 'missing-tokens',
          message: 'Missing mosparo submit or validation token.',
        });
        expect(verifyRequests()).toHaveLength(0);
      },
    );

    it('fails when the private key is wrong', async () => {
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission(
        { ...form, ...tokens },
        { config: { ...config, privateKey: 'wrong-key' } },
      );

      expect(result).toMatchObject({ valid: false, code: 'request-failed' });
    });

    it('fails when mosparo cannot be reached', async () => {
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission(
        { ...form, ...tokens },
        // Nothing listens on this port.
        { config: { ...config, host: 'http://127.0.0.1:9' } },
      );

      expect(result).toMatchObject({ valid: false, code: 'request-failed' });
    });

    it('fails when mosparo does not answer in time', async () => {
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);
      mosparo.settings.verifyDelayMs = 500;

      const result = await verifySubmission(
        { ...form, ...tokens },
        { config, timeoutMs: 50 },
      );

      expect(result).toEqual({
        valid: false,
        code: 'timeout',
        message: 'mosparo did not answer within 50 ms.',
        verifiedFields: {},
        issues: [],
      });
    });
  });

  describe('configuration', () => {
    function setServerEnv() {
      vi.stubEnv('MOSPARO_HOST', config.host);
      vi.stubEnv('MOSPARO_PUBLIC_KEY', project.publicKey);
      vi.stubEnv('MOSPARO_PRIVATE_KEY', project.privateKey);
    }

    it('comes from the MOSPARO_* environment variables when none is passed', async () => {
      setServerEnv();
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission({ ...form, ...tokens });

      expect(result.valid).toBe(true);
    });

    it('takes host and public key from the NEXT_PUBLIC_ variables the widget uses', async () => {
      vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', config.host);
      vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', project.publicKey);
      vi.stubEnv('MOSPARO_PRIVATE_KEY', project.privateKey);
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission({ ...form, ...tokens });

      expect(result.valid).toBe(true);
    });

    it('prefers an explicit config over the environment', async () => {
      setServerEnv();
      vi.stubEnv('MOSPARO_PRIVATE_KEY', 'wrong-key');
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission({ ...form, ...tokens }, { config });

      expect(result.valid).toBe(true);
    });

    it('fails without asking mosparo when there is no configuration', async () => {
      const form = { name: 'Ada' };
      const tokens = await widgetChecks(form);

      const result = await verifySubmission({ ...form, ...tokens });

      expect(result).toMatchObject({ valid: false, code: 'missing-config' });
      expect(verifyRequests()).toHaveLength(0);
    });
  });

  it('refuses to run in a browser, where the private key must never be', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});

    await expect(verifySubmission({}, { config })).rejects.toThrow(
      'must only run on the server',
    );

    vi.unstubAllGlobals();
  });
});
