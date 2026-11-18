// @vitest-environment node
import { Agent } from 'node:https';
import { Client, VerificationResult } from '@mosparo/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifySubmission } from '../src/server';
import { clearMosparoEnv } from './helpers';

// Only the client is replaced, so no request leaves the machine. Results are
// built with the real VerificationResult class of @mosparo/api-client.
const { apiVerifySubmission } = vi.hoisted(() => ({
  apiVerifySubmission: vi.fn(),
}));

vi.mock('@mosparo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mosparo/api-client')>();
  return {
    VerificationResult: actual.VerificationResult,
    Client: vi.fn(function () {
      return { verifySubmission: apiVerifySubmission };
    }),
  };
});

const config = {
  host: 'https://mosparo.test',
  uuid: 'project-uuid',
  publicKey: 'public-key',
  privateKey: 'private-key',
};

const tokens = {
  _mosparo_submitToken: 'submit-token',
  _mosparo_validationToken: 'validation-token',
};

function verificationResult(
  submittable: boolean,
  valid: boolean,
  verifiedFields: Record<string, string> = {},
  issues: unknown[] = [],
) {
  return new VerificationResult(
    submittable,
    valid,
    // Typed as an array upstream, but the API returns a field → status map.
    verifiedFields as unknown as unknown[],
    issues,
  );
}

function setServerEnv() {
  vi.stubEnv('MOSPARO_HOST', 'https://env.test');
  vi.stubEnv('MOSPARO_UUID', 'env-uuid');
  vi.stubEnv('MOSPARO_PUBLIC_KEY', 'env-public-key');
  vi.stubEnv('MOSPARO_PRIVATE_KEY', 'env-private-key');
}

beforeEach(() => {
  clearMosparoEnv();
  vi.mocked(Client).mockClear();
  apiVerifySubmission.mockReset();
  apiVerifySubmission.mockResolvedValue(verificationResult(true, true));
});

describe('verifySubmission', () => {
  describe('with a submission mosparo accepts', () => {
    it('reports it as valid, with the verified fields', async () => {
      apiVerifySubmission.mockResolvedValue(
        verificationResult(true, true, { name: 'valid', email: 'valid' }),
      );

      const result = await verifySubmission(
        { name: 'Ada', email: 'ada@example.com', ...tokens },
        { config },
      );

      expect(result).toEqual({
        success: true,
        valid: true,
        verifiedFields: { name: 'valid', email: 'valid' },
        issues: [],
      });
    });

    it('sends the form fields and tokens to the configured mosparo project', async () => {
      await verifySubmission(
        { name: 'Ada', email: 'ada@example.com', ...tokens },
        { config },
      );

      expect(Client).toHaveBeenCalledExactlyOnceWith(
        'https://mosparo.test',
        'public-key',
        'private-key',
        expect.anything(),
      );
      expect(apiVerifySubmission).toHaveBeenCalledExactlyOnceWith(
        { name: 'Ada', email: 'ada@example.com' },
        'submit-token',
        'validation-token',
      );
    });

    it('accepts FormData and leaves uploaded files out', async () => {
      const formData = new FormData();
      formData.set('name', 'Ada');
      formData.set('attachment', new File(['%PDF'], 'cv.pdf'));
      formData.set('_mosparo_submitToken', 'submit-token');
      formData.set('_mosparo_validationToken', 'validation-token');

      const result = await verifySubmission(formData, { config });

      expect(result.valid).toBe(true);
      expect(apiVerifySubmission).toHaveBeenCalledExactlyOnceWith(
        { name: 'Ada' },
        'submit-token',
        'validation-token',
      );
    });

    it('leaves out framework fields, underscore fields and excluded fields', async () => {
      await verifySubmission(
        {
          name: 'Ada',
          $ACTION_ID_4f2a: '',
          _csrf: 'csrf-token',
          honeypot: '',
          ...tokens,
        },
        { config, excludeFields: ['honeypot'] },
      );

      expect(apiVerifySubmission).toHaveBeenCalledExactlyOnceWith(
        { name: 'Ada' },
        'submit-token',
        'validation-token',
      );
    });
  });

  describe('with a submission mosparo rejects', () => {
    it('reports it as invalid, with the issues mosparo found', async () => {
      const issues = [{ message: 'Submission was detected as spam.' }];
      apiVerifySubmission.mockResolvedValue(
        verificationResult(false, false, {}, issues),
      );

      const result = await verifySubmission({ name: 'Ada', ...tokens }, { config });

      expect(result).toEqual({
        success: true,
        valid: false,
        verifiedFields: {},
        issues,
      });
    });

    it.each([
      { submittable: true, valid: false },
      { submittable: false, valid: true },
    ])(
      'is invalid when submittable is $submittable and valid is $valid',
      async ({ submittable, valid }) => {
        apiVerifySubmission.mockResolvedValue(
          verificationResult(submittable, valid),
        );

        const result = await verifySubmission({ name: 'Ada', ...tokens }, { config });

        expect(result.valid).toBe(false);
      },
    );
  });

  describe('configuration', () => {
    it('uses the MOSPARO_* environment variables when no config is passed', async () => {
      setServerEnv();

      const result = await verifySubmission({ name: 'Ada', ...tokens });

      expect(result.valid).toBe(true);
      expect(Client).toHaveBeenCalledExactlyOnceWith(
        'https://env.test',
        'env-public-key',
        'env-private-key',
        expect.anything(),
      );
    });

    it('prefers an explicit config over the environment', async () => {
      setServerEnv();

      await verifySubmission({ name: 'Ada', ...tokens }, { config });

      expect(Client).toHaveBeenCalledExactlyOnceWith(
        'https://mosparo.test',
        'public-key',
        'private-key',
        expect.anything(),
      );
    });

    it('fails without calling mosparo when there is no configuration', async () => {
      const result = await verifySubmission({ name: 'Ada', ...tokens });

      expect(result).toEqual({
        success: false,
        valid: false,
        verifiedFields: {},
        issues: [],
        error: expect.stringContaining('Missing mosparo server config'),
      });
      expect(Client).not.toHaveBeenCalled();
    });
  });

  describe('TLS certificate checks', () => {
    /** The options verifySubmission created the API client with. */
    const clientOptions = () =>
      vi.mocked(Client).mock.calls[0][3] as { httpsAgent?: Agent };

    it('are left on by default', async () => {
      await verifySubmission({ name: 'Ada', ...tokens }, { config });

      expect(clientOptions()).toEqual({});
    });

    it('are turned off for the mosparo host with verifySsl: false', async () => {
      await verifySubmission(
        { name: 'Ada', ...tokens },
        { config: { ...config, verifySsl: false } },
      );

      const { httpsAgent } = clientOptions();
      expect(httpsAgent).toBeInstanceOf(Agent);
      expect(httpsAgent?.options.rejectUnauthorized).toBe(false);
    });

    it('are turned off with MOSPARO_VERIFY_SSL=false', async () => {
      setServerEnv();
      vi.stubEnv('MOSPARO_VERIFY_SSL', 'false');

      await verifySubmission({ name: 'Ada', ...tokens });

      expect(clientOptions().httpsAgent?.options.rejectUnauthorized).toBe(false);
    });
  });

  describe('when verification cannot be done', () => {
    it.each(['_mosparo_submitToken', '_mosparo_validationToken'] as const)(
      'fails without calling mosparo when %s is missing',
      async (missingToken) => {
        const { [missingToken]: _removed, ...incomplete } = {
          name: 'Ada',
          ...tokens,
        };

        const result = await verifySubmission(incomplete, { config });

        expect(result).toMatchObject({
          success: false,
          valid: false,
          error: 'Missing mosparo submit or validation token.',
        });
        expect(apiVerifySubmission).not.toHaveBeenCalled();
      },
    );

    it('returns the error instead of throwing when the API client fails', async () => {
      apiVerifySubmission.mockRejectedValue(new Error('socket hang up'));

      const result = await verifySubmission({ name: 'Ada', ...tokens }, { config });

      expect(result).toEqual({
        success: false,
        valid: false,
        verifiedFields: {},
        issues: [],
        error: 'socket hang up',
      });
    });

    it('passes on the reason the API client gives as a plain string', async () => {
      // The real client rejects with strings, such as the message of the
      // underlying HTTP error.
      apiVerifySubmission.mockRejectedValue('Request failed with status code 401');

      const result = await verifySubmission({ name: 'Ada', ...tokens }, { config });

      expect(result).toMatchObject({
        success: false,
        valid: false,
        error: 'Request failed with status code 401',
      });
    });
  });
});
