export interface FakeMosparoSettings {
  invisible: boolean;
  honeypotFieldName: string | null;
  spamText: string;
  refuseTokens: boolean;
  verifyDelayMs: number;
}

export interface FakeMosparoRequest {
  endpoint: string;
  /** What the widget sent. */
  data?: Record<string, string>;
  /** Names of the fields the backend sent for verification. */
  fields?: string[];
}

export interface FakeMosparo {
  readonly settings: FakeMosparoSettings;
  readonly requests: FakeMosparoRequest[];
  reset(): void;
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
}

export const project: {
  uuid: string;
  publicKey: string;
  privateKey: string;
};

export function createFakeMosparo(): FakeMosparo;
