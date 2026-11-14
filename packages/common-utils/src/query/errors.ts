export class QueryError extends Error {
  constructor(
    message: string,
    public query: string,
  ) {
    super(message);
    this.name = 'QueryError';
  }
}

/** Server error shape with code/type for timeout and MCP error classification. */
export class CodedQueryError extends Error {
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
    this.name = 'CodedQueryError';
    Object.setPrototypeOf(this, CodedQueryError.prototype);
  }
}
