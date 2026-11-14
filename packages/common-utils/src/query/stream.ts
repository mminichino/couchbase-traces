/**
 * Adapts a `ReadableStream` into an async iterable. Needed because native async
 * iteration over `ReadableStream` is missing in some browsers we support.
 */
export async function* streamToAsyncIterator<T>(
  stream: ReadableStream<T> | AsyncIterable<T>,
): AsyncIterableIterator<T> {
  if (!('getReader' in stream)) {
    yield* stream;
    return;
  }

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
