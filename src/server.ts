import mosparoApiClient from '@mosparo/api-client';
import {
  MOSPARO_FIELD_PREFIX,
  MOSPARO_SUBMIT_TOKEN_FIELD,
  MOSPARO_VALIDATION_TOKEN_FIELD,
} from './constants';
import { serverConfigFromEnv } from './env';
import type { MosparoServerConfig } from './types';

export type { MosparoServerConfig } from './types';

/** Why a submission was not accepted. */
export type VerifyFailureCode =
  /** No config was passed and the environment variables are not set. */
  | 'missing-config'
  /** The submission has no mosparo tokens: the widget did not check it. */
  | 'missing-tokens'
  /** mosparo did not accept the submission: spam, changed data or a used token. */
  | 'rejected'
  /** A field listed in `requiredFields` was not verified by mosparo. */
  | 'unverified-field'
  /** mosparo did not answer in time. */
  | 'timeout'
  /** mosparo could not be reached or gave an unusable answer. */
  | 'request-failed';

export interface MosparoIssue {
  /** Name of the field the issue is about, if it is about one. */
  name?: string;
  message: string;
}

/** Result of the verification of one field. */
export type MosparoFieldStatus = 'valid' | 'invalid';

export interface VerifySubmissionOptions {
  /** Project to verify against. Defaults to the `MOSPARO_*` environment variables. */
  config?: MosparoServerConfig;
  /**
   * Fields that must have been verified by mosparo. Without this, a bot can
   * keep a field away from mosparo's rules, e.g. by turning it into a
   * password field, which the widget does not read.
   */
  requiredFields?: string[];
  /**
   * Fields that are never sent to mosparo. mosparo receives a hash of every
   * other value, so list secrets the widget does not read anyway: passwords,
   * hidden tokens.
   */
  ignoredFields?: string[];
  /** How long to wait for mosparo, in milliseconds. Default: 10000. */
  timeoutMs?: number;
}

export type VerifySubmissionResult =
  | {
      valid: true;
      /** The fields mosparo verified, by name. */
      verifiedFields: Record<string, MosparoFieldStatus>;
      issues: MosparoIssue[];
    }
  | {
      valid: false;
      code: VerifyFailureCode;
      /** Details for your logs. Do not show this to visitors. */
      message: string;
      verifiedFields: Record<string, MosparoFieldStatus>;
      issues: MosparoIssue[];
    };

const DEFAULT_TIMEOUT_MS = 10_000;

/** Hidden fields that React adds to forms with a server action. */
const REACT_ACTION_FIELD_PREFIX = '$ACTION_';

type FormValue = string | FormValue[] | { [key: string]: FormValue };

/**
 * Keep what can be verified: text, and lists and groups of text. Files,
 * booleans and empty values are never read by the widget.
 */
function toFormValue(value: unknown): FormValue | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value
      .map(toFormValue)
      .filter((item): item is FormValue => item !== undefined);
  }
  if (value !== null && typeof value === 'object' && isPlainObject(value)) {
    const group: { [key: string]: FormValue } = {};
    for (const [key, item] of Object.entries(value)) {
      const formValue = toFormValue(item);
      if (formValue !== undefined) group[key] = formValue;
    }
    return group;
  }
  return undefined;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Read the submitted fields the way the widget names and groups them. */
async function readFields(
  data: FormData | Request | Record<string, unknown>,
): Promise<Record<string, FormValue>> {
  if (typeof Request !== 'undefined' && data instanceof Request) {
    const request = data.clone();
    const isJson = (request.headers.get('content-type') ?? '').includes(
      'application/json',
    );
    return readFields(isJson ? await request.json() : await request.formData());
  }

  const fields: Record<string, FormValue> = {};

  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    for (const name of new Set(data.keys())) {
      const values = data
        .getAll(name)
        .filter((value): value is string => typeof value === 'string');
      if (values.length === 0) continue;
      // Like the widget: several fields with one name, or a name ending in
      // `[]`, make a list.
      fields[name] =
        values.length > 1 || name.endsWith('[]') ? values : values[0];
    }
    return fields;
  }

  for (const [name, value] of Object.entries(data ?? {})) {
    const formValue = toFormValue(value);
    if (formValue !== undefined) fields[name] = formValue;
  }
  return fields;
}

function fail(
  code: VerifyFailureCode,
  message: string,
  details?: Pick<VerifySubmissionResult, 'verifiedFields' | 'issues'>,
): VerifySubmissionResult {
  return {
    valid: false,
    code,
    message,
    verifiedFields: details?.verifiedFields ?? {},
    issues: details?.issues ?? [],
  };
}

/**
 * Have mosparo verify a submitted form. Call it on the server, before the
 * submission is used, and only continue when `valid` is `true`.
 *
 * It never throws for a failed verification: an unreachable mosparo, a
 * timeout or missing tokens all give `valid: false` with a `code`.
 */
export async function verifySubmission(
  data: FormData | Request | Record<string, unknown>,
  options: VerifySubmissionOptions = {},
): Promise<VerifySubmissionResult> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    throw new Error(
      'verifySubmission() needs the private key of the mosparo project and must only run on the server.',
    );
  }

  const config = options.config ?? serverConfigFromEnv();
  if (!config) {
    return fail(
      'missing-config',
      'Missing mosparo server config. Pass `config` or set MOSPARO_HOST, MOSPARO_PUBLIC_KEY and MOSPARO_PRIVATE_KEY.',
    );
  }

  let fields: Record<string, FormValue>;
  try {
    fields = await readFields(data);
  } catch (error) {
    return fail('missing-tokens', `The submission could not be read: ${describe(error)}`);
  }

  const submitToken = fields[MOSPARO_SUBMIT_TOKEN_FIELD];
  const validationToken = fields[MOSPARO_VALIDATION_TOKEN_FIELD];
  if (
    typeof submitToken !== 'string' ||
    typeof validationToken !== 'string' ||
    !submitToken ||
    !validationToken
  ) {
    return fail('missing-tokens', 'Missing mosparo submit or validation token.');
  }

  const ignored = new Set(options.ignoredFields ?? []);
  const formData: Record<string, FormValue> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (name.startsWith(MOSPARO_FIELD_PREFIX)) continue;
    if (name.startsWith(REACT_ACTION_FIELD_PREFIX)) continue;
    if (ignored.has(name)) continue;
    formData[name] = value;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const abort = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, timeoutMs);

  let verifiedFields: Record<string, MosparoFieldStatus>;
  let issues: MosparoIssue[];
  let accepted: boolean;
  try {
    const client = new mosparoApiClient.Client(
      config.host,
      config.publicKey,
      config.privateKey,
      { signal: abort.signal },
    );
    const result = await client.verifySubmission(
      formData,
      submitToken,
      validationToken,
    );

    accepted = result.isSubmittable() && result.isValid();
    // An empty list of fields arrives as an array.
    const fieldResults = result.getVerifiedFields();
    verifiedFields =
      fieldResults && !Array.isArray(fieldResults) ? { ...fieldResults } : {};
    issues = (result.getIssues() ?? []).filter(Boolean);
  } catch (error) {
    return timedOut
      ? fail('timeout', `mosparo did not answer within ${timeoutMs} ms.`)
      : fail('request-failed', describe(error));
  } finally {
    clearTimeout(timer);
  }

  if (!accepted) {
    return fail(
      'rejected',
      issues[0]?.message ?? 'mosparo did not accept the submission.',
      { verifiedFields, issues },
    );
  }

  const unverified = (options.requiredFields ?? []).filter(
    (name) => verifiedFields[name] !== 'valid',
  );
  if (unverified.length > 0) {
    return fail(
      'unverified-field',
      `Not verified by mosparo: ${unverified.join(', ')}.`,
      { verifiedFields, issues },
    );
  }

  return { valid: true, verifiedFields, issues };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' && error ? error : 'Unknown error';
}
