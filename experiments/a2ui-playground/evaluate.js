// Data model access and the basic-catalog functions the renderer runs. No DOM here.

// Writing these keys could reach Object.prototype through a model object.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Split a JSON Pointer (RFC 6901) into unescaped segments. */
export function pointerSegments(pointer) {
  if (pointer === '' || pointer === '/') return [];
  return pointer.replace(/^\//, '').split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export const hasUnsafeSegment = (pointer) => pointerSegments(pointer).some((s) => UNSAFE_KEYS.has(s));

/** Resolve a binding path against the current scope: relative paths sit under the template item. */
export function absolutePath(path, base = '') {
  if (path.startsWith('/')) return path;
  return (base.replace(/\/$/, '') + '/' + path).replace(/^\/?/, '/');
}

export function getPath(model, pointer) {
  let node = model;
  for (const seg of pointerSegments(pointer)) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, seg)) return undefined;
    node = node[seg];
  }
  return node;
}

/** Upsert as updateDataModel does: missing parents are created, a null value removes the key. */
export function setPath(model, pointer, value) {
  const segs = pointerSegments(pointer);
  if (segs.some((s) => UNSAFE_KEYS.has(s))) throw new Error('unsafe path');
  if (!segs.length) return value === null ? {} : value;
  let node = model;
  for (const [i, seg] of segs.slice(0, -1).entries()) {
    if (node[seg] === null || typeof node[seg] !== 'object') node[seg] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    node = node[seg];
  }
  const last = segs.at(-1);
  if (value === null) {
    if (Array.isArray(node) && /^\d+$/.test(last)) node.splice(Number(last), 1);
    else delete node[last];
  } else {
    node[last] = value;
  }
  return model;
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** DynamicBoolean coercion: a validation result counts as its `valid` flag. */
export function truthy(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'valid' in v) return Boolean(v.valid);
  return Boolean(v);
}

const result = (valid) => ({ valid: Boolean(valid) });

// Only ${path} interpolation; function calls inside ${...} are rejected by the validator.
export function interpolate(template, ctx) {
  return String(template).replace(/\\\$\{|\$\{([^}]*)\}/g, (m, expr) => {
    if (expr === undefined) return '${';
    const v = getPath(ctx.model, absolutePath(expr.trim(), ctx.base));
    if (v === undefined || v === null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function numberFormat(args, extra = {}) {
  const opts = { useGrouping: args.grouping !== false, ...extra };
  if (typeof args.decimals === 'number') {
    opts.minimumFractionDigits = args.decimals;
    opts.maximumFractionDigits = args.decimals;
  }
  return opts;
}

export const FUNCTIONS = {
  required: ({ value }) => result(!isEmpty(value)),
  email: ({ value }) => result(typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
  length: ({ value, min, max }) => {
    const n = typeof value === 'string' ? [...value].length : 0;
    return result((min === undefined || n >= min) && (max === undefined || n <= max));
  },
  numeric: ({ value, min, max }) => {
    const n = Number(value);
    return result(value !== '' && value !== null && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max));
  },
  and: ({ values }) => (Array.isArray(values) ? values.every(truthy) : false),
  or: ({ values }) => (Array.isArray(values) ? values.some(truthy) : false),
  not: ({ value }) => !truthy(value),
  formatString: ({ value }, ctx) => interpolate(value ?? '', ctx),
  formatNumber: (args) => (Number.isFinite(Number(args.value)) ? new Intl.NumberFormat(undefined, numberFormat(args)).format(Number(args.value)) : ''),
  formatCurrency: (args) => {
    if (!Number.isFinite(Number(args.value))) return '';
    try {
      return new Intl.NumberFormat(undefined, numberFormat(args, { style: 'currency', currency: String(args.currency) })).format(Number(args.value));
    } catch {
      return String(args.value);
    }
  },
  '@index': ({ offset = 0 }, ctx) => (ctx.index ?? 0) + Number(offset || 0),
};

/** Resolve a Dynamic* value: a literal, {"@path"}, or {"@call"}. */
export function evaluate(value, ctx) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => evaluate(v, ctx));
  if (typeof value['@path'] === 'string') return getPath(ctx.model, absolutePath(value['@path'], ctx.base));
  if (typeof value['@call'] === 'string') {
    const fn = FUNCTIONS[value['@call']];
    if (!fn) return undefined;
    const args = {};
    for (const [k, v] of Object.entries(value.args || {})) args[k] = evaluate(v, ctx);
    return fn(args, ctx);
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/^@@/, '@'), evaluate(v, ctx)]));
}

export function toText(v) {
  if (v === undefined || v === null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
