export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: number | string } | null)?.code;
  const message = error instanceof Error ? error.message : '';
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS' || message.includes('ALREADY_EXISTS');
}
