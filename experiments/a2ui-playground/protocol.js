// Parse and validate A2UI v1.0 agent-to-renderer messages, then fold them into surface state. No DOM here.
import { hasUnsafeSegment, setPath } from './evaluate.js';

export const BASIC_CATALOG = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
export const LIMITS = { bytes: 200_000, components: 500, depth: 32, items: 200, drawn: 2000 };

const JUSTIFY = ['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch'];
const ALIGN = ['start', 'center', 'end', 'stretch'];

// Prop kinds: str, num, bool and list are Dynamic* values; the rest are literals or structures.
export const COMPONENTS = {
  Text: { required: ['text'], props: { text: 'str', variant: ['caption', 'body'] } },
  Row: { required: ['children'], props: { children: 'children', justify: JUSTIFY, align: ALIGN } },
  Column: { required: ['children'], props: { children: 'children', justify: JUSTIFY, align: ALIGN } },
  List: { required: ['children'], props: { children: 'children', direction: ['vertical', 'horizontal'], align: ALIGN } },
  Card: { required: ['child'], props: { child: 'id' } },
  Tabs: { required: ['tabs'], props: { tabs: 'tabs' } },
  Divider: { required: [], props: { axis: ['horizontal', 'vertical'] } },
  Button: { required: ['child', 'action'], checks: true, props: { child: 'id', variant: ['default', 'primary', 'borderless'], action: 'action' } },
  CheckBox: { required: ['label', 'value'], checks: true, props: { label: 'str', value: 'bool' } },
  TextField: { required: ['label', 'value'], checks: true, props: { label: 'str', value: 'str', placeholder: 'str', variant: ['longText', 'number', 'shortText', 'obscured'] } },
  ChoicePicker: { required: ['options', 'value'], checks: true, props: { label: 'str', variant: ['multipleSelection', 'mutuallyExclusive'], options: 'options', value: 'list', displayStyle: ['checkbox', 'chips'], filterable: 'boolean' } },
  Slider: { required: ['value', 'max'], checks: true, props: { label: 'str', min: 'number', max: 'number', value: 'num', steps: 'integer' } },
  DateTimeInput: { required: ['value'], checks: true, props: { value: 'str', enableDate: 'boolean', enableTime: 'boolean', min: 'str', max: 'str', label: 'str' } },
};

export const SUPPORTED = Object.keys(COMPONENTS);

export const LEFT_OUT = {
  Image: 'This playground doesn\'t load images from a response, because the URL would be fetched by your browser. Use Text or a Card instead.',
  Video: 'This playground doesn\'t load video from a response, because the URL would be fetched by your browser.',
  AudioPlayer: 'This playground doesn\'t load audio from a response, because the URL would be fetched by your browser.',
  Icon: 'This playground doesn\'t draw icons. Use a Text label instead.',
  Modal: 'This playground doesn\'t draw modals. Put the content in a Card instead.',
};

// Arg kinds per function; `need` lists the required args.
const FUNCTION_ARGS = {
  required: { args: { value: 'any' }, need: ['value'] },
  email: { args: { value: 'str' }, need: ['value'] },
  length: { args: { value: 'str', min: 'integer', max: 'integer' }, need: ['value'] },
  numeric: { args: { value: 'num', min: 'number', max: 'number' }, need: ['value'] },
  and: { args: { values: 'array' }, need: ['values'] },
  or: { args: { values: 'array' }, need: ['values'] },
  not: { args: { value: 'bool' }, need: ['value'] },
  formatString: { args: { value: 'str' }, need: ['value'] },
  formatNumber: { args: { value: 'num', decimals: 'num', grouping: 'bool' }, need: ['value'] },
  formatCurrency: { args: { value: 'num', currency: 'str', decimals: 'num', grouping: 'bool' }, need: ['value', 'currency'] },
  '@index': { args: { offset: 'num' }, need: [] },
};

const LEFT_OUT_FUNCTIONS = {
  regex: 'regex isn\'t supported here yet, because it needs the spec\'s pattern safety check. Use length, email or required.',
  openUrl: 'openUrl isn\'t supported here, so a response can\'t open pages in your browser.',
  formatDate: 'formatDate isn\'t supported here. Put the date in the data model as text.',
  pluralize: 'pluralize isn\'t supported here. Use formatString with a number instead.',
};

const MESSAGE_TYPES = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'];
const RPC_TYPES = ['callRendererFunction', 'agentFunctionResponse'];
const ID = /^[\p{XID_Start}_][\p{XID_Continue}]*$/u;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
const join = (path, key) => `${path}/${esc(key)}`;
const typeName = (v) => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : `a ${typeof v}`);

function lineOf(text, position) {
  return text.slice(0, position).split('\n').length;
}

/** Turn text into a list of messages: a JSON array, one message, {"messages": [...]}, or JSON Lines. */
export function parseMessages(input) {
  const text = String(input ?? '').trim();
  if (!text) return { errors: [{ path: '', message: 'There is nothing to render. Pick a preset or paste A2UI messages.' }] };
  if (text.length > LIMITS.bytes) return { errors: [{ path: '', message: `The messages are ${Math.round(text.length / 1000)} KB, over the ${LIMITS.bytes / 1000} KB this playground reads. Trim the response and try again.` }] };
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(text);
  const body = fenced ? fenced[1].trim() : text;
  if (!/^[[{]/.test(body)) {
    const start = body.split('\n')[0].slice(0, 40);
    return { errors: [{ path: '', message: `This isn't JSON: it starts with "${start}". A2UI messages start with [ or {.` }] };
  }
  try {
    const data = JSON.parse(body);
    if (Array.isArray(data)) return { messages: data };
    if (isObject(data) && Array.isArray(data.messages) && Object.keys(data).length === 1) return { messages: data.messages };
    return { messages: [data] };
  } catch (err) {
    const lines = body.split('\n').filter((l) => l.trim());
    if (body.startsWith('{') && lines.length > 1) {
      const messages = [];
      for (const [i, line] of lines.entries()) {
        try {
          messages.push(JSON.parse(line));
        } catch {
          return { errors: [{ path: '', message: `Line ${i + 1} isn't valid JSON. Each line has to be one complete message; look for a missing comma, quote or bracket.` }] };
        }
      }
      return { messages };
    }
    const pos = /position (\d+)/.exec(String(err.message));
    const where = pos ? `near line ${lineOf(body, Number(pos[1]))}` : 'somewhere';
    return { errors: [{ path: '', message: `This isn't valid JSON: something is wrong ${where}. Look for a missing comma, quote or bracket.` }] };
  }
}

/** Validate one Dynamic* value or literal of the given kind. */
function checkValue(value, kind, path, errors, ctx) {
  if (isObject(value) && ('@path' in value || '@call' in value)) {
    if ('@path' in value) {
      if (Object.keys(value).length !== 1 || typeof value['@path'] !== 'string') errors.push({ path, message: 'A binding is {"@path": "/some/path"} with nothing else in it.' });
      else if (hasUnsafeSegment(value['@path'])) errors.push({ path, message: 'This path uses __proto__, constructor or prototype, which the playground refuses.' });
      return;
    }
    checkCall(value, path, errors, ctx);
    return;
  }
  const ok = {
    any: () => true,
    str: () => typeof value === 'string',
    num: () => typeof value === 'number',
    number: () => typeof value === 'number',
    integer: () => Number.isInteger(value),
    bool: () => typeof value === 'boolean',
    boolean: () => typeof value === 'boolean',
    list: () => Array.isArray(value) && value.every((v) => typeof v === 'string'),
    array: () => Array.isArray(value),
  }[kind];
  if (kind === 'array' && Array.isArray(value)) {
    value.forEach((v, i) => checkValue(v, 'any', join(path, i), errors, ctx));
    return;
  }
  if (!ok()) {
    const want = { str: 'text', num: 'a number', number: 'a number', integer: 'a whole number', bool: 'true or false', boolean: 'true or false', list: 'a list of strings', array: 'a list' }[kind];
    errors.push({ path, message: `Expected ${want}, got ${typeName(value)}.` });
  }
  if (kind === 'any' && isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (/^@([^@]|$)/.test(k)) errors.push({ path: join(path, k), message: `"${k}" isn't an A2UI directive. Write "@${k}" to mean a literal key that starts with @.` });
      else checkValue(v, 'any', join(path, k), errors, ctx);
    }
  }
}

function checkCall(call, path, errors, ctx) {
  const name = call['@call'];
  if (typeof name !== 'string') {
    errors.push({ path, message: 'A function call needs "@call" set to the function name.' });
    return;
  }
  if (LEFT_OUT_FUNCTIONS[name]) {
    errors.push({ path: join(path, '@call'), message: LEFT_OUT_FUNCTIONS[name] });
    return;
  }
  const spec = FUNCTION_ARGS[name];
  if (!spec) {
    errors.push({ path: join(path, '@call'), message: `${name} isn't a basic-catalog function this playground runs.` });
    return;
  }
  for (const key of Object.keys(call)) {
    if (!['@call', 'args', 'catalogId'].includes(key)) errors.push({ path: join(path, key), message: `A function call has no "${key}" property.` });
  }
  if ('catalogId' in call && call.catalogId !== BASIC_CATALOG) errors.push({ path: join(path, 'catalogId'), message: 'Only the basic catalog is available here.' });
  const args = call.args ?? {};
  if (!isObject(args)) {
    errors.push({ path: join(path, 'args'), message: 'args has to be an object.' });
    return;
  }
  for (const need of spec.need) {
    if (!(need in args)) errors.push({ path: join(path, 'args'), message: `${name} needs an argument called ${need}.` });
  }
  for (const [k, v] of Object.entries(args)) {
    if (!spec.args[k]) errors.push({ path: join(join(path, 'args'), k), message: `${name} has no argument called ${k}.` });
    else checkValue(v, spec.args[k], join(join(path, 'args'), k), errors, ctx);
  }
  if (name === 'formatString' && typeof args.value === 'string' && /\$\{[^}]*\(/.test(args.value)) {
    errors.push({ path: join(join(path, 'args'), 'value'), message: 'formatString here fills in data paths like ${/user/name}, not function calls.' });
  }
}

function checkAction(action, path, errors, ctx) {
  if (!isObject(action) || Object.keys(action).length !== 1 || !('event' in action || 'functionCall' in action)) {
    errors.push({ path, message: 'An action is {"event": {...}} or {"functionCall": {...}}.' });
    return;
  }
  if (action.functionCall) {
    checkCall(action.functionCall, join(path, 'functionCall'), errors, ctx);
    return;
  }
  const ev = action.event;
  const p = join(path, 'event');
  if (!isObject(ev) || typeof ev.name !== 'string' || !ev.name) {
    errors.push({ path: p, message: 'An event needs a name.' });
    return;
  }
  for (const key of Object.keys(ev)) {
    if (!['name', 'userMessage', 'context'].includes(key)) errors.push({ path: join(p, key), message: `An event has no "${key}" property.` });
  }
  if ('userMessage' in ev) checkValue(ev.userMessage, 'str', join(p, 'userMessage'), errors, ctx);
  if ('context' in ev) {
    if (!isObject(ev.context)) errors.push({ path: join(p, 'context'), message: 'context has to be an object.' });
    else for (const [k, v] of Object.entries(ev.context)) checkValue(v, 'any', join(join(p, 'context'), k), errors, ctx);
  }
}

function checkProp(kind, value, path, errors, ctx) {
  if (Array.isArray(kind)) {
    if (!kind.includes(value)) errors.push({ path, message: `Use one of ${kind.join(', ')}.` });
    return;
  }
  switch (kind) {
    case 'id':
      if (typeof value !== 'string' || !ID.test(value)) errors.push({ path, message: 'Expected a component id.' });
      return;
    case 'children':
      if (Array.isArray(value)) {
        value.forEach((v, i) => { if (typeof v !== 'string' || !ID.test(v)) errors.push({ path: join(path, i), message: 'Expected a component id.' }); });
      } else if (isObject(value) && typeof value.componentId === 'string' && typeof value.path === 'string' && Object.keys(value).length === 2) {
        if (hasUnsafeSegment(value.path)) errors.push({ path: join(path, 'path'), message: 'This path uses __proto__, constructor or prototype, which the playground refuses.' });
      } else {
        errors.push({ path, message: 'children is a list of ids, or {"componentId": ..., "path": ...} for a template.' });
      }
      return;
    case 'tabs':
      if (!Array.isArray(value) || !value.length) {
        errors.push({ path, message: 'tabs is a list of {"title", "child"} with at least one tab.' });
        return;
      }
      value.forEach((tab, i) => {
        const tp = join(path, i);
        if (!isObject(tab) || !('title' in tab) || typeof tab.child !== 'string') errors.push({ path: tp, message: 'Each tab needs a title and a child id.' });
        else checkValue(tab.title, 'str', join(tp, 'title'), errors, ctx);
      });
      return;
    case 'options':
      if (!Array.isArray(value)) {
        errors.push({ path, message: 'options is a list of {"label", "value"}.' });
        return;
      }
      value.forEach((opt, i) => {
        const op = join(path, i);
        if (!isObject(opt) || typeof opt.value !== 'string' || !('label' in opt)) errors.push({ path: op, message: 'Each option needs a label and a string value.' });
        else checkValue(opt.label, 'str', join(op, 'label'), errors, ctx);
      });
      return;
    case 'action':
      checkAction(value, path, errors, ctx);
      return;
    default:
      checkValue(value, kind, path, errors, ctx);
  }
}

function checkComponent(comp, path, errors, ctx) {
  if (!isObject(comp)) {
    errors.push({ path, message: 'Each component has to be an object.' });
    return false;
  }
  if (typeof comp.id !== 'string' || !ID.test(comp.id)) {
    errors.push({ path: join(path, 'id'), message: 'Each component needs an id made of letters, digits and underscores, not starting with a digit (user_card, not user-card).' });
  }
  const type = comp.component;
  if (LEFT_OUT[type]) {
    errors.push({ path: join(path, 'component'), message: LEFT_OUT[type] });
    return false;
  }
  const spec = COMPONENTS[type];
  if (!spec) {
    errors.push({ path: join(path, 'component'), message: typeof type === 'string' ? `${type} isn't in the A2UI basic catalog. Use one of ${SUPPORTED.join(', ')}.` : 'Each component needs a "component" type such as Text or Column.' });
    return false;
  }
  for (const req of spec.required) {
    if (!(req in comp)) errors.push({ path, message: `${type} needs a "${req}" property.` });
  }
  for (const [key, value] of Object.entries(comp)) {
    const p = join(path, key);
    if (key === 'id' || key === 'component') continue;
    if (key === 'weight') {
      if (typeof value !== 'number') errors.push({ path: p, message: 'weight has to be a number.' });
    } else if (key === '@catalogId') {
      if (value !== BASIC_CATALOG) errors.push({ path: p, message: 'Only the basic catalog is available here.' });
    } else if (key === '@accessibility') {
      checkAccessibility(value, p, errors, ctx);
    } else if (key === '@metadata') {
      if (!isObject(value)) errors.push({ path: p, message: '@metadata has to be an object.' });
    } else if (key === '@checks') {
      if (!spec.checks) errors.push({ path: p, message: `${type} doesn't take @checks.` });
      else checkChecks(value, p, errors, ctx);
    } else if (spec.props[key]) {
      checkProp(spec.props[key], value, p, errors, ctx);
    } else {
      errors.push({ path: p, message: `${type} has no "${key}" property.` });
    }
  }
  return true;
}

function checkAccessibility(value, path, errors, ctx) {
  if (!isObject(value)) {
    errors.push({ path, message: '@accessibility has to be an object.' });
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    const p = join(path, k);
    if (k === 'label' || k === 'description') checkValue(v, 'str', p, errors, ctx);
    else if (k === 'hidden') checkValue(v, 'bool', p, errors, ctx);
    else if (k === 'live') checkProp(['off', 'polite', 'assertive'], v, p, errors, ctx);
    else errors.push({ path: p, message: `@accessibility has no "${k}" property.` });
  }
}

function checkChecks(value, path, errors, ctx) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: '@checks is a list of {"condition", "message"}.' });
    return;
  }
  value.forEach((rule, i) => {
    const p = join(path, i);
    if (!isObject(rule) || !isObject(rule.condition)) {
      errors.push({ path: p, message: 'Each check needs a condition: a binding or a function call.' });
      return;
    }
    checkValue(rule.condition, 'bool', join(p, 'condition'), errors, ctx);
    if ('message' in rule && typeof rule.message !== 'string') errors.push({ path: join(p, 'message'), message: 'A check message has to be text.' });
  });
}

/** Ids of every component a reference points at, with the property it came from. */
export function childRefs(comp) {
  const refs = [];
  if (Array.isArray(comp.children)) comp.children.forEach((id, i) => refs.push([id, `children/${i}`]));
  else if (isObject(comp.children)) refs.push([comp.children.componentId, 'children/componentId']);
  if (typeof comp.child === 'string') refs.push([comp.child, 'child']);
  if (Array.isArray(comp.tabs)) comp.tabs.forEach((t, i) => isObject(t) && refs.push([t.child, `tabs/${i}/child`]));
  return refs;
}

function checkTree(surface, errors) {
  const { components, where } = surface;
  if (!components.has('root')) {
    errors.push({ path: surface.path, message: `Surface ${surface.id} has no component with the id root, so there is nothing to draw.` });
    return;
  }
  if (components.size > LIMITS.components) {
    errors.push({ path: surface.path, message: `Surface ${surface.id} has ${components.size} components, over the ${LIMITS.components} this playground draws.` });
    return;
  }
  const reported = new Set();
  const walk = (id, stack, inTemplate) => {
    const comp = components.get(id);
    if (!inTemplate && JSON.stringify(comp).includes('"@call":"@index"') && !reported.has(id)) {
      errors.push({ path: where.get(id), message: '@index only works inside a list template, and this component is not in one.' });
      reported.add(id);
    }
    if (stack.length > LIMITS.depth) {
      if (!reported.has('depth')) errors.push({ path: where.get(id), message: `The tree is nested deeper than ${LIMITS.depth} levels.` });
      reported.add('depth');
      return;
    }
    for (const [childId, prop] of childRefs(comp)) {
      const p = `${where.get(id)}/${prop}`;
      // A non-string ref is already reported as "Expected a component id"; looking it up would print [object Object].
      if (typeof childId !== 'string' || surface.rejected.has(childId)) continue;
      if (!components.has(childId)) {
        if (!reported.has(p)) errors.push({ path: p, message: `This points at "${childId}", but no component has that id.` });
        reported.add(p);
      } else if (stack.includes(childId)) {
        if (!reported.has(p)) errors.push({ path: p, message: `"${childId}" contains itself through this reference, which would never end.` });
        reported.add(p);
      } else {
        walk(childId, [...stack, childId], inTemplate || prop === 'children/componentId');
      }
    }
  };
  walk('root', ['root'], false);
}

function checkEnvelope(msg, path, errors) {
  if (!isObject(msg)) {
    errors.push({ path, message: 'Each message has to be a JSON object.' });
    return null;
  }
  if (msg.version !== '1.0') errors.push({ path: join(path, 'version'), message: `Each message needs "version": "1.0"${'version' in msg ? `, not ${JSON.stringify(msg.version)}` : ''}.` });
  const keys = Object.keys(msg).filter((k) => k !== 'version');
  const rpc = keys.find((k) => RPC_TYPES.includes(k));
  if (rpc) {
    errors.push({ path: join(path, rpc), message: `${rpc} needs a live agent session, which this playground doesn't have.` });
    return null;
  }
  const types = keys.filter((k) => MESSAGE_TYPES.includes(k));
  const unknown = keys.filter((k) => !MESSAGE_TYPES.includes(k));
  if (unknown.length) errors.push({ path: join(path, unknown[0]), message: `"${unknown[0]}" isn't an A2UI message type. Use ${MESSAGE_TYPES.join(', ')}.` });
  if (types.length !== 1) {
    if (!unknown.length) errors.push({ path, message: `A message holds exactly one of ${MESSAGE_TYPES.join(', ')}.` });
    return null;
  }
  const body = msg[types[0]];
  if (!isObject(body)) {
    errors.push({ path: join(path, types[0]), message: `${types[0]} has to be an object.` });
    return null;
  }
  return types[0];
}

function addComponents(surface, list, path, errors) {
  if (!Array.isArray(list)) {
    errors.push({ path, message: 'components has to be a list.' });
    return;
  }
  const ctx = {};
  list.forEach((comp, i) => {
    const p = join(path, i);
    const ok = checkComponent(comp, p, errors, ctx);
    if (isObject(comp) && typeof comp.id === 'string') {
      // A rejected component is already reported, so references to it aren't reported again.
      if (ok) surface.components.set(comp.id, comp);
      else surface.rejected.add(comp.id);
      surface.where.set(comp.id, p);
    }
  });
}

function updateData(surface, body, path, errors) {
  const pointer = body.path ?? '/';
  if (typeof pointer !== 'string' || (pointer && !pointer.startsWith('/'))) {
    errors.push({ path: join(path, 'path'), message: 'path is a JSON Pointer that starts with /.' });
    return;
  }
  if (hasUnsafeSegment(pointer)) {
    errors.push({ path: join(path, 'path'), message: 'This path uses __proto__, constructor or prototype, which the playground refuses.' });
    return;
  }
  if (!('value' in body)) {
    errors.push({ path, message: 'updateDataModel needs a value; use null to remove the key.' });
    return;
  }
  const next = setPath(surface.dataModel, pointer, structuredClone(body.value));
  surface.dataModel = isObject(next) ? next : {};
}

/** Apply messages in order, onto existing surfaces if given. Returns the surfaces left standing and every problem found. */
export function load(messages, surfaces = new Map()) {
  const errors = [];
  if (!Array.isArray(messages) || !messages.length) return { surfaces, errors: [{ path: '', message: 'There are no messages to render.' }] };
  messages.forEach((msg, i) => {
    const path = `/${i}`;
    const type = checkEnvelope(msg, path, errors);
    if (!type) return;
    const body = msg[type];
    const bp = join(path, type);
    if (typeof body.surfaceId !== 'string' || !body.surfaceId) {
      errors.push({ path: join(bp, 'surfaceId'), message: `${type} needs a surfaceId.` });
      return;
    }
    const allowed = {
      createSurface: ['surfaceId', 'catalogId', 'sendDataModel', 'components', 'dataModel', 'metadata'],
      updateComponents: ['surfaceId', 'components'],
      updateDataModel: ['surfaceId', 'path', 'value'],
      deleteSurface: ['surfaceId'],
    }[type];
    for (const key of Object.keys(body)) {
      if (key === 'theme' && type === 'createSurface') errors.push({ path: join(bp, key), message: 'A2UI v1.0 dropped theme from createSurface; styling comes from the renderer. Remove it.' });
      else if (!allowed.includes(key)) errors.push({ path: join(bp, key), message: `${type} has no "${key}" property.` });
    }
    const existing = surfaces.get(body.surfaceId);
    if (type === 'createSurface') {
      if (existing) {
        errors.push({ path: join(bp, 'surfaceId'), message: `Surface ${body.surfaceId} already exists. Send deleteSurface first, or use another id.` });
        return;
      }
      if (body.catalogId !== BASIC_CATALOG) {
        errors.push({ path: join(bp, 'catalogId'), message: `Set catalogId to the basic catalog, ${BASIC_CATALOG}. It's the only one this playground has.` });
      }
      if ('dataModel' in body && !isObject(body.dataModel)) errors.push({ path: join(bp, 'dataModel'), message: 'dataModel has to be an object.' });
      if ('sendDataModel' in body && typeof body.sendDataModel !== 'boolean') errors.push({ path: join(bp, 'sendDataModel'), message: 'sendDataModel is true or false.' });
      const surface = { id: body.surfaceId, path: bp, components: new Map(), where: new Map(), rejected: new Set(), dataModel: isObject(body.dataModel) ? structuredClone(body.dataModel) : {}, sendDataModel: body.sendDataModel === true };
      if (body.dataModel && Object.keys(body.dataModel).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k))) {
        errors.push({ path: join(bp, 'dataModel'), message: 'dataModel uses __proto__, constructor or prototype as a key, which the playground refuses.' });
      }
      surfaces.set(body.surfaceId, surface);
      if ('components' in body) addComponents(surface, body.components, join(bp, 'components'), errors);
      return;
    }
    if (!existing) {
      errors.push({ path: join(bp, 'surfaceId'), message: `There is no surface ${body.surfaceId}. Send createSurface for it first.` });
      return;
    }
    if (type === 'updateComponents') addComponents(existing, body.components, join(bp, 'components'), errors);
    else if (type === 'updateDataModel') updateData(existing, body, bp, errors);
    else surfaces.delete(body.surfaceId);
  });
  for (const surface of surfaces.values()) checkTree(surface, errors);
  return { surfaces, errors };
}

/** Parse and load in one step, which is what the page does on Render. */
export function read(text) {
  const parsed = parseMessages(text);
  if (parsed.errors) return { surfaces: new Map(), errors: parsed.errors };
  try {
    return load(parsed.messages);
  } catch (err) {
    // JSON nested thousands of levels deep fits in 200 KB and can overflow the stack.
    if (err instanceof RangeError) return { surfaces: new Map(), errors: [{ path: '', message: 'The messages are nested too deeply to read. Flatten the data model or the function calls.' }] };
    throw err;
  }
}

/** The component a problem's pointer falls inside, read from the messages: { id, type }, or null. */
export function locate(messages, pointer) {
  const m = /^\/(\d+)\/(\w+)\/components\/(\d+)(?:\/|$)/.exec(String(pointer || ''));
  if (!m || !Array.isArray(messages)) return null;
  const comp = messages[Number(m[1])]?.[m[2]]?.components?.[Number(m[3])];
  if (!isObject(comp)) return null;
  return {
    id: typeof comp.id === 'string' ? comp.id : null,
    type: typeof comp.component === 'string' ? comp.component : null,
  };
}
