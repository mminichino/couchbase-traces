export class SetupError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = 'SetupError';
  }
}

export function exitCodeOf(err: unknown): number {
  if (err instanceof SetupError) return err.exitCode;
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (
    name === 'AuthenticationFailureError' ||
    /permission|not authorized|13014/i.test(message)
  ) {
    return 3;
  }
  return 5;
}
