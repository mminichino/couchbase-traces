export class QueryError extends Error {
  constructor(
    message: string,
    public query: string,
  ) {
    super(message);
    this.name = 'QueryError';
  }
}

/** Legacy ClickHouse server error shape for timeout / MCP error classification. */
export class ClickHouseError extends Error {
  readonly code: string;
  readonly type: string | undefined;

  constructor({
    message,
    code,
    type,
  }: {
    message: string;
    code: string;
    type?: string;
  }) {
    super(message);
    this.code = code;
    this.type = type;
    Object.setPrototypeOf(this, ClickHouseError.prototype);
  }
}
