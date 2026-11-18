import {
  MOSPARO_SUBMIT_TOKEN_FIELD,
  MOSPARO_VALIDATION_TOKEN_FIELD,
} from './constants';
import { resolveServerConfig } from './env';
import type { VerifySubmissionOptions, VerifySubmissionResult } from './types';

export type { VerifySubmissionOptions, VerifySubmissionResult } from './types';
export type { MosparoServerConfig } from './types';

export async function verifySubmission(
  data: FormData | Record<string, unknown>,
  options?: VerifySubmissionOptions,
): Promise<VerifySubmissionResult> {
  const fail = (error: string): VerifySubmissionResult => ({
    success: false,
    valid: false,
    verifiedFields: {},
    issues: [],
    error,
  });

  try {
    // Resolve config
    const config = options?.config ?? resolveServerConfig();
    if (!config) {
      return fail(
        'Missing mosparo server config. Provide via options or MOSPARO_* environment variables.',
      );
    }

    // Normalize FormData to plain object
    let raw: Record<string, unknown>;
    if (data instanceof FormData) {
      raw = {};
      data.forEach((value, key) => {
        // Skip File values — mosparo only verifies string fields
        if (typeof value === 'string') {
          raw[key] = value;
        }
      });
    } else {
      raw = { ...data };
    }

    // Extract tokens
    const submitToken = raw[MOSPARO_SUBMIT_TOKEN_FIELD];
    const validationToken = raw[MOSPARO_VALIDATION_TOKEN_FIELD];

    if (typeof submitToken !== 'string' || typeof validationToken !== 'string') {
      return fail('Missing mosparo submit or validation token.');
    }

    // Build exclusion set
    const excludeSet = new Set(options?.excludeFields ?? []);

    // Clean form data: strip $ and _ prefixed fields, mosparo internals, and user-excluded fields
    const cleanFormData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('$') || key.startsWith('_')) continue;
      if (excludeSet.has(key)) continue;
      cleanFormData[key] = value;
    }

    // Dynamic import to keep @mosparo/api-client out of client bundles
    const { Client } = await import('@mosparo/api-client');

    // The client hands these options to axios. Certificate checks are on
    // unless they are turned off explicitly, e.g. for a self-signed
    // certificate on an internal mosparo host.
    const clientOptions: Record<string, unknown> = {};
    if (config.verifySsl === false) {
      const { Agent } = await import('node:https');
      clientOptions.httpsAgent = new Agent({ rejectUnauthorized: false });
    }

    const client = new Client(
      config.host,
      config.publicKey,
      config.privateKey,
      clientOptions,
    );

    const result = await client.verifySubmission(
      cleanFormData,
      submitToken,
      validationToken,
    );

    return {
      success: true,
      valid: result.isSubmittable() && result.isValid(),
      verifiedFields: result.getVerifiedFields() as Record<string, string>,
      issues: result.getIssues(),
    };
  } catch (err) {
    // @mosparo/api-client rejects with plain strings, not Error objects
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string' && err
          ? err
          : 'Unknown verification error';
    return fail(message);
  }
}
