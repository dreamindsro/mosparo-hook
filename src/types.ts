/** What the widget needs to find a mosparo project. */
export interface MosparoConfig {
  /** URL of the mosparo installation, e.g. `https://mosparo.example.com`. */
  host: string;
  /** Unique identification number of the project. */
  uuid: string;
  /** Public key of the project. */
  publicKey: string;
}

/** What the server needs to have a submission verified. */
export interface MosparoServerConfig {
  host: string;
  publicKey: string;
  /** Private key of the project. Never send it to the browser. */
  privateKey: string;
  /** Not needed for verification; accepted so one object can hold all keys. */
  uuid?: string;
}

/** Options of the mosparo widget. See the mosparo documentation for details. */
export interface MosparoOptions {
  allowBrowserValidation?: boolean;
  cssResourceUrl?: string;
  customMessages?: Record<string, Record<string, string>>;
  designMode?: boolean;
  inputFieldSelector?: string;
  language?: string;
  /** Load the project's stylesheet from mosparo. On unless set to `false`. */
  loadCssResource?: boolean;
  name?: string;
  requestSubmitTokenOnInit?: boolean;

  /** Hide the box and check the form on submit, whatever the project says. */
  forceInvisible?: boolean;

  // Forms that are split over several steps
  isMultiStepForm?: boolean;
  isLastStep?: boolean;
  /** Submit token of the previous step. */
  submitToken?: string;
}

/** The form data the widget sends to mosparo. */
export interface MosparoFormData {
  fields: { name: string; value: unknown; fieldPath: string }[];
  ignoredFields: string[];
}

export interface MosparoCallbacks {
  /** Before the widget reads the form. */
  onBeforeGetFormData?: (form: HTMLFormElement) => void;
  /** After the widget read the form. Has to return the form data. */
  onGetFormData?: (
    form: HTMLFormElement,
    formData: MosparoFormData,
  ) => MosparoFormData;
  /** For every field the widget reads. Has to return the value. */
  onGetFieldValue?: (field: HTMLElement, value: unknown) => unknown;
  /** After mosparo checked the form. */
  onCheckForm?: (valid: boolean) => void;
  /** After the widget went back to its unchecked state. */
  onResetState?: () => void;
  /** After the widget stopped a submit of a form it has not checked. */
  onAbortSubmit?: () => void;
  /** Multi-step forms: after a step was stored. Replaces the default flow. */
  onFormDataStored?: () => void;
  /** Multi-step forms: after the form was found valid. Replaces the default flow. */
  onFormDataValid?: () => void;
}

export interface MosparoInvisibleCallbacks {
  onSwitchToInvisible?: () => void;
  /** When a submit starts the check. */
  onValidateFormInvisible?: () => void;
  /** Before the checked form is submitted. */
  onSubmitFormInvisible?: () => void;
  /**
   * Submits the checked form. The default is `form.requestSubmit()`, so that
   * submit handlers and form actions run.
   */
  doSubmitFormInvisible?: () => void;
}

/**
 * Where the widget is:
 * - `loading`: the script or the submit token is being fetched
 * - `ready`: waiting for the visitor
 * - `checking`: mosparo is checking the form
 * - `verified`: mosparo accepted the form; it can be submitted
 * - `invalid`: mosparo rejected the form
 * - `error`: the widget cannot work, e.g. mosparo is unreachable or the
 *   project keys are wrong
 */
export type MosparoStatus =
  | 'loading'
  | 'ready'
  | 'checking'
  | 'verified'
  | 'invalid'
  | 'error';

/** The two tokens mosparo adds to a checked form. */
export interface MosparoTokens {
  submitToken: string;
  validationToken: string;
}

/** The widget class that mosparo's frontend script puts on `window`. */
export type MosparoConstructor = new (
  containerId: string,
  host: string,
  uuid: string,
  publicKey: string,
  options?: Record<string, unknown>,
) => unknown;

declare global {
  interface Window {
    mosparo?: MosparoConstructor;
  }
}
