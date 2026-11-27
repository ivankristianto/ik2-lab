// Apply messages one at a time, the way a stream arrives, so the page can step through a reply. No DOM here.
import { load } from './protocol.js';

const short = (value) => {
  const text = JSON.stringify(value) ?? 'nothing';
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

/** One line on what a message does, safe for any input. */
export function describe(message) {
  const type = message && typeof message === 'object' ? Object.keys(message).find((k) => k !== 'version') : undefined;
  const raw = type ? message[type] : undefined;
  const body = raw && typeof raw === 'object' ? raw : {};
  const id = typeof body.surfaceId === 'string' ? body.surfaceId : 'a surface';
  const ids = (list) => (Array.isArray(list) ? list.map((c) => c && c.id).filter((x) => typeof x === 'string') : []);
  switch (type) {
    case 'createSurface': {
      const n = ids(body.components).length;
      return `createSurface makes ${id}${n ? ` with ${n} ${n === 1 ? 'component' : 'components'}` : ''}.`;
    }
    case 'updateComponents':
      return `updateComponents on ${id} adds or replaces ${ids(body.components).join(', ') || 'nothing'}.`;
    case 'updateDataModel':
      return `updateDataModel on ${id} sets ${typeof body.path === 'string' && body.path ? body.path : '/'} to ${short(body.value)}.`;
    case 'deleteSurface':
      return `deleteSurface removes ${id} and everything in it.`;
    default:
      return 'This message isn\'t one of the four A2UI message types.';
  }
}

/** Surfaces after the first n messages. A message with problems is skipped and listed in rejected. */
export function playTo(messages, n) {
  const list = Array.isArray(messages) ? messages : [];
  const step = Math.max(Math.min(n, list.length), list.length ? 1 : 0);
  let surfaces = new Map();
  const rejected = [];
  for (let i = 0; i < step; i++) {
    const trial = structuredClone(surfaces);
    const { errors } = load([structuredClone(list[i])], trial);
    if (errors.length) rejected.push({ index: i, errors: errors.map((e) => ({ ...e, path: e.path.replace(/^\/0(?=\/|$)/, `/${i}`) })) });
    else surfaces = trial;
  }
  return { step, total: list.length, surfaces, rejected };
}
