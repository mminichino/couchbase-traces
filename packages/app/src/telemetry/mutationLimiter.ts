/**
 * Rate limit for replayed attribute mutations.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE.
 */
/** The fields of an rrweb event the recorder reads (see @rrweb/types). */
export type RrwebEvent = { type: number; timestamp: number; data: unknown };

const INCREMENTAL = 3;
const SRC_MUTATION = 0;
const BUCKET_SIZE = 100;
const REFILL_PER_MS = 10 / 1000;

type MutationData = {
  source: number;
  attributes: { id: number }[];
  adds: unknown[];
  removes: unknown[];
  texts: unknown[];
};

function isMutation(event: RrwebEvent): event is RrwebEvent & {
  data: MutationData;
} {
  const data: unknown = event.data;
  return (
    event.type === INCREMENTAL &&
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    data.source === SRC_MUTATION &&
    'attributes' in data &&
    Array.isArray(data.attributes)
  );
}

/**
 * Drops attribute mutations of nodes that change more than 10 times a second
 * after a burst of 100, so an element animated through its attributes cannot
 * flood the replay. Nodes inside an SVG share their `svg` element's bucket.
 */
export class MutationLimiter {
  #buckets = new WeakMap<Node, { tokens: number; at: number }>();
  readonly #onBlocked: () => void;

  constructor(onBlocked: () => void) {
    this.#onBlocked = onBlocked;
  }

  /** @returns The event without dropped mutations, or nothing if none remain. */
  filter(
    event: RrwebEvent,
    getNode: (id: number) => Node | null,
    now: number,
  ): RrwebEvent | undefined {
    if (!isMutation(event)) return event;
    const { attributes, adds, removes, texts } = event.data;
    const kept = attributes.filter(mutation => {
      const node = getNode(mutation.id);
      const key =
        node instanceof Element ? (node.closest('svg') ?? node) : node;
      return key === null || this.#take(key, now);
    });
    if (kept.length === attributes.length) return event;
    this.#onBlocked();
    if (kept.length + adds.length + removes.length + texts.length === 0) {
      return undefined;
    }
    return { ...event, data: { ...event.data, attributes: kept } };
  }

  reset(): void {
    this.#buckets = new WeakMap();
  }

  #take(key: Node, now: number): boolean {
    const bucket = this.#buckets.get(key) ?? { tokens: BUCKET_SIZE, at: now };
    bucket.tokens = Math.min(
      BUCKET_SIZE,
      bucket.tokens + (now - bucket.at) * REFILL_PER_MS,
    );
    bucket.at = now;
    this.#buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
