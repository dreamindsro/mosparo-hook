export interface MosparoConfig {
  host: string;
  uuid: string;
  publicKey: string;
}

export interface MosparoServerConfig extends MosparoConfig {
  privateKey: string;
  verifySsl?: boolean;
}

export interface MosparoOptions {
  allowBrowserValidation?: boolean;
  cssResourceUrl?: string;
  customMessages?: Record<string, Record<string, string>>;
  designMode?: boolean;
  inputFieldSelector?: string;
  language?: string;
  loadCssResource?: boolean;
  name?: string;
  requestSubmitTokenOnInit?: boolean;
}

export interface MosparoCallbacks {
  onBeforeGetFormData?: (formData: Record<string, unknown>) => Record<string, unknown>;
  onGetFormData?: (formData: Record<string, unknown>) => void;
  onGetFieldValue?: (fieldName: string, fieldValue: unknown) => unknown;
  onCheckForm?: () => void;
  onResetState?: () => void;
  onAbortSubmit?: () => void;
}

export interface MosparoInvisibleCallbacks {
  onSwitchToInvisible?: () => void;
  onValidateFormInvisible?: () => boolean;
  onSubmitFormInvisible?: () => void;
  doSubmitFormInvisible?: () => void;
}

export interface VerifySubmissionOptions {
  config?: MosparoServerConfig;
  excludeFields?: string[];
}

export interface VerifySubmissionResult {
  success: boolean;
  valid: boolean;
  verifiedFields: Record<string, string>;
  issues: unknown[];
  error?: string;
}

declare global {
  interface Window {
    mosparo: new (
      containerId: string,
      host: string,
      uuid: string,
      publicKey: string,
      options?: Record<string, unknown>,
    ) => unknown;
  }
}
