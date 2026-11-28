/**
 * Classifies rrweb events for the replay recorder. Ported from
 * @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see NOTICE.
 */
import { record } from '@rrweb/record';

import type { RrwebEvent } from './mutationLimiter';

// rrweb event and source numbers, see @rrweb/types.
export const FULL_SNAPSHOT = 2;
const INCREMENTAL = 3;
export const META = 4;

type Data = Record<string, any>;

/** rrweb event data and node metadata are plain objects; anything else reads as empty. */
function fields(value: unknown): Data {
  return typeof value === 'object' && value !== null ? value : {};
}

function isDocument(node: Node): node is Document {
  return node.nodeType === Node.DOCUMENT_NODE;
}

export function isUserInput(event: RrwebEvent): boolean {
  if (event.type !== INCREMENTAL) return false;
  const data = fields(event.data);
  switch (data.source) {
    case 1: // MouseMove
    case 3: // Scroll
    case 6: // TouchMove
    case 12: // Drag
      return true;
    case 2: // MouseInteraction, except Focus and Blur
      return data.type !== 5 && data.type !== 6;
    case 5: // Input
      return data.userTriggered === true;
    default:
      return false;
  }
}

/** Events from a frame rrweb blocked (recorded with a placeholder size). */
export function isFromBlockedFrame(event: RrwebEvent): boolean {
  if (event.type !== INCREMENTAL) return false;
  const data = fields(event.data);
  const id =
    data.id ??
    data.positions?.[0]?.id ??
    (data.adds?.[0] ?? data.removes?.[0])?.parentId ??
    (data.texts?.[0] ?? data.attributes?.[0])?.id;
  for (
    let node: Node | null | undefined =
      id === undefined ? null : record.mirror.getNode(id);
    node;
    node = (isDocument(node) ? node : node.ownerDocument)?.defaultView
      ?.frameElement
  ) {
    const meta = fields(record.mirror.getMeta(node));
    if (fields(meta.attributes).rr_width !== undefined) return true;
  }
  return false;
}
