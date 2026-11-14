export class QueryError extends Error {
  constructor(
    message: string,
    public query: string,
  ) {
    super(message);
    this.name = 'QueryError';
  }
}
