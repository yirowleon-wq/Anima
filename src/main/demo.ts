import type { Message } from '../shared/types';
import { emptyRoute, type MapCard } from '../shared/map-v2';
import type { CampusMapAdapter } from './mapService';

async function pause(signal: AbortSignal, ms = 420) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function runDemo(
  input: string,
  m: Message,
  signal: AbortSignal,
  publish: () => void,
  map?: CampusMapAdapter,
  mapCard?: (card: MapCard) => void,
) {
  const mapIntent = /map|route|walk|directions|location|where\b/i.test(input);
  m.obligations = [];
  m.actions = [];
  if (mapIntent && map && mapCard) mapCard({kind:'route',route:emptyRoute("Open the map and select a destination. Direct map controls work without waiting for a model.")});
  let text: string;
  if (mapIntent) {
    text = "You can open the map directly. Search for or select a building, then choose “Route between two points” to see a route.\n\nChoose the start on the map. The route retains unresolved entrances and connections in its data.";
  } else {
    const excerpt = Array.from(input.trim());
    const quote = (excerpt.slice(0, 100).join('') + (excerpt.length > 100 ? '…' : ''))
      .replace(/[\\`*_{}\[\]()#+.!|>$~\-]/g, '\\$&');
    text = `${quote ? `What you just wrote—“${quote}”—stays in this conversation.` : "What you want to say can stay in this conversation."}

No model is connected yet. Choose a model in Connections, then continue here without rewriting your message.`;
  }
  for (const part of text.match(/.{1,18}|\n/g) || []) {
    await pause(signal, 12);
    m.content += part;
    publish();
  }
}
