export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}

export class ValidationError extends Error {
  override readonly name = "ValidationError";
}

export class DependencyError extends Error {
  override readonly name = "DependencyError";
}

export class ExternalApiError extends Error {
  override readonly name = "ExternalApiError";
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
