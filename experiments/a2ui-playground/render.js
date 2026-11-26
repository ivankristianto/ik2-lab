// Draw validated A2UI surfaces with DOM APIs. Response text only ever reaches the page through textContent or attributes.
import { evaluate, truthy, toText, setPath, absolutePath, getPath } from './evaluate.js';
import { LIMITS } from './protocol.js';

let uid = 0;
const nextId = (name) => `a2ui-${++uid}-${name}`;

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly', stretch: 'stretch' };
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...kids);
  return node;
}

/** Render one surface. Returns its element and a refresh() that re-reads every binding. */
export function renderSurface(surface, { onAction = () => {} } = {}) {
  const updaters = [];
  const refresh = () => updaters.forEach((fn) => fn());
  // A getter, because a root-level updateDataModel replaces the model object.
  const scope = (base, index) => ({ get model() { return surface.dataModel; }, base, index });
  const watch = (fn) => { updaters.push(fn); fn(); };
  let templateNote = '';
  let drawn = 0;

  const write = (binding, ctx, value) => {
    if (binding && typeof binding === 'object' && typeof binding['@path'] === 'string') {
      surface.dataModel = setPath(surface.dataModel, absolutePath(binding['@path'], ctx.base), value);
    }
  };

  // Each check is a condition that has to hold; failing ones give their messages.
  const failing = (comp, ctx) => (comp['@checks'] || [])
    .filter((rule) => !truthy(evaluate(rule.condition, ctx)))
    .map((rule) => rule.message || 'This value isn\'t valid.');

  function accessibility(node, comp, ctx, nodes) {
    const a11y = comp['@accessibility'];
    if (!a11y) return;
    watch(() => {
      if ('label' in a11y) node.setAttribute('aria-label', toText(evaluate(a11y.label, ctx)));
      if ('hidden' in a11y) node.toggleAttribute('aria-hidden', truthy(evaluate(a11y.hidden, ctx)));
    });
    if (a11y.live) node.setAttribute('aria-live', a11y.live);
    if ('description' in a11y) {
      const desc = el('span', { id: nextId('desc'), hidden: true });
      watch(() => { desc.textContent = toText(evaluate(a11y.description, ctx)); });
      node.setAttribute('aria-describedby', [node.getAttribute('aria-describedby'), desc.id].filter(Boolean).join(' '));
      nodes.push(desc);
    }
  }

  // Field check messages appear once the visitor has touched the field.
  function checkList(comp, ctx, control) {
    if (!comp['@checks']) return null;
    const list = el('div', { id: nextId('checks'), class: 'a2ui-checks' });
    control.setAttribute('aria-describedby', list.id);
    let touched = false;
    const show = () => {
      const msgs = touched ? failing(comp, ctx) : [];
      list.replaceChildren(...msgs.map((m) => el('span', { class: 'lab-status lab-status--error', text: m })));
      control.setAttribute('aria-invalid', msgs.length ? 'true' : 'false');
    };
    control.addEventListener('focusout', () => { touched = true; show(); });
    control.addEventListener('input', () => { touched = true; });
    watch(show);
    return list;
  }

  function children(comp, ctx, stack, wrap) {
    const spec = comp.children;
    if (Array.isArray(spec)) return spec.map((id) => wrap(draw(id, ctx, stack)));
    const listPath = absolutePath(spec.path, ctx.base);
    const items = getPath(surface.dataModel, listPath);
    if (!Array.isArray(items)) return [];
    if (items.length > LIMITS.items) templateNote = `Only the first ${LIMITS.items} of ${items.length} list items are drawn.`;
    return items.slice(0, LIMITS.items).map((_, i) => wrap(draw(spec.componentId, scope(`${listPath}/${i}`, i), stack)));
  }

  const RENDER = {
    Text(comp, ctx, opts) {
      const first = toText(evaluate(comp.text, ctx));
      const heading = !opts.inline && /^#{1,6}\s/.test(first);
      const node = el(opts.inline ? 'span' : heading ? 'h3' : 'p', { class: heading ? 'a2ui-heading' : comp.variant === 'caption' ? 'a2ui-caption' : 'a2ui-text' });
      watch(() => { node.textContent = toText(evaluate(comp.text, ctx)).replace(/^#{1,6}\s+/, ''); });
      return node;
    },
    Row(comp, ctx, opts, stack) {
      const node = el('div', { class: 'a2ui-row' });
      // Custom properties, not inline justify/align, so the phone layout can still override them.
      if (comp.justify) node.style.setProperty('--a2ui-justify', JUSTIFY[comp.justify]);
      if (comp.align) node.style.setProperty('--a2ui-align', ALIGN[comp.align]);
      node.append(...children(comp, ctx, stack, (c) => c).flat());
      return node;
    },
    Column(comp, ctx, opts, stack) {
      const node = el('div', { class: 'a2ui-column' });
      // Custom properties, not inline justify/align, so the phone layout can still override them.
      if (comp.justify) node.style.setProperty('--a2ui-justify', JUSTIFY[comp.justify]);
      if (comp.align) node.style.setProperty('--a2ui-align', ALIGN[comp.align]);
      node.append(...children(comp, ctx, stack, (c) => c).flat());
      return node;
    },
    List(comp, ctx, opts, stack) {
      const node = el('ul', { class: comp.direction === 'horizontal' ? 'a2ui-list a2ui-list--horizontal' : 'a2ui-list' });
      node.append(...children(comp, ctx, stack, (c) => el('li', {}, ...[c].flat())));
      return node;
    },
    Card(comp, ctx, opts, stack) {
      return el('div', { class: 'a2ui-card' }, ...[draw(comp.child, ctx, stack)].flat());
    },
    Divider(comp) {
      return el('hr', { class: comp.axis === 'vertical' ? 'a2ui-divider a2ui-divider--vertical' : 'a2ui-divider', 'aria-orientation': comp.axis === 'vertical' ? 'vertical' : null });
    },
    Tabs(comp, ctx, opts, stack) {
      const list = el('div', { role: 'tablist', class: 'a2ui-tablist' });
      const panels = [];
      const tabs = comp.tabs.map((tab, i) => {
        const button = el('button', { type: 'button', role: 'tab', id: nextId('tab') });
        watch(() => { button.textContent = toText(evaluate(tab.title, ctx)); });
        const panel = el('div', { role: 'tabpanel', id: nextId('panel'), 'aria-labelledby': button.id, tabindex: '0' }, ...[draw(tab.child, ctx, stack)].flat());
        button.setAttribute('aria-controls', panel.id);
        button.addEventListener('click', () => select(i));
        panels.push(panel);
        return button;
      });
      const select = (index, focus = false) => tabs.forEach((t, i) => {
        t.setAttribute('aria-selected', String(i === index));
        t.tabIndex = i === index ? 0 : -1;
        panels[i].hidden = i !== index;
        if (focus && i === index) t.focus();
      });
      // Arrow keys move between tabs, as the ARIA tabs pattern expects.
      list.addEventListener('keydown', (e) => {
        const at = tabs.indexOf(document.activeElement);
        if (at < 0) return;
        const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        select((to + tabs.length) % tabs.length, true);
      });
      list.append(...tabs);
      select(0);
      return el('div', { class: 'a2ui-tabs' }, list, ...panels);
    },
    Button(comp, ctx, opts, stack) {
      const cls = { primary: 'lab-button', borderless: 'a2ui-link' }[comp.variant] || 'lab-button lab-button--secondary';
      const node = el('button', { type: 'button', class: cls }, ...[draw(comp.child, ctx, stack, { inline: true })].flat());
      const blocked = el('span', { id: nextId('why'), class: 'lab-hint' });
      if (comp['@checks']) {
        node.setAttribute('aria-describedby', blocked.id);
        watch(() => {
          const msgs = failing(comp, ctx);
          node.disabled = msgs.length > 0;
          blocked.textContent = msgs.join(' ');
          blocked.hidden = !msgs.length;
        });
      }
      node.addEventListener('click', () => {
        const ev = comp.action.event;
        if (!ev) return;
        const message = {
          version: '1.0',
          action: {
            name: ev.name,
            surfaceId: surface.id,
            sourceComponentId: comp.id,
            timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
            ...(ev.userMessage !== undefined ? { userMessage: toText(evaluate(ev.userMessage, ctx)) } : {}),
            context: evaluate(ev.context || {}, ctx),
          },
        };
        onAction(message, surface);
      });
      return comp['@checks'] ? [node, blocked] : node;
    },
    CheckBox(comp, ctx) {
      const input = el('input', { type: 'checkbox' });
      const label = el('span');
      watch(() => {
        input.checked = truthy(evaluate(comp.value, ctx));
        label.textContent = toText(evaluate(comp.label, ctx));
      });
      input.addEventListener('change', () => { write(comp.value, ctx, input.checked); refresh(); });
      const checks = checkList(comp, ctx, input);
      return [el('label', { class: 'a2ui-check' }, input, label), checks].filter(Boolean);
    },
    TextField(comp, ctx) {
      const id = nextId('field');
      const variant = comp.variant || 'shortText';
      const input = variant === 'longText'
        ? el('textarea', { id, class: 'lab-textarea lab-textarea--short' })
        : el('input', { id, class: 'lab-input', type: variant === 'obscured' ? 'password' : 'text', inputmode: variant === 'number' ? 'decimal' : null, autocomplete: 'off' });
      const label = el('label', { class: 'lab-label', for: id });
      watch(() => {
        label.textContent = toText(evaluate(comp.label, ctx));
        if ('placeholder' in comp) input.placeholder = toText(evaluate(comp.placeholder, ctx));
        const value = toText(evaluate(comp.value, ctx));
        if (input.value !== value && document.activeElement !== input) input.value = value;
      });
      input.addEventListener('input', () => {
        const raw = input.value;
        const asNumber = variant === 'number' && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
        write(comp.value, ctx, asNumber);
        refresh();
      });
      return el('div', { class: 'lab-field' }, label, input, ...[checkList(comp, ctx, input)].filter(Boolean));
    },
    ChoicePicker(comp, ctx) {
      const multiple = comp.variant === 'multipleSelection';
      const name = nextId('choice');
      const legend = el('legend', { class: 'lab-label' });
      const inputs = comp.options.map((opt) => {
        const input = el('input', { type: multiple ? 'checkbox' : 'radio', name, value: opt.value });
        const text = el('span');
        watch(() => { text.textContent = toText(evaluate(opt.label, ctx)); });
        return [input, el('label', { class: 'a2ui-check' }, input, text)];
      });
      watch(() => {
        legend.textContent = toText(evaluate(comp.label, ctx));
        legend.hidden = !('label' in comp);
        const chosen = evaluate(comp.value, ctx);
        const set = new Set(Array.isArray(chosen) ? chosen : []);
        inputs.forEach(([input]) => { input.checked = set.has(input.value); });
      });
      inputs.forEach(([input]) => input.addEventListener('change', () => {
        write(comp.value, ctx, inputs.filter(([i]) => i.checked).map(([i]) => i.value));
        refresh();
      }));
      const field = el('fieldset', { class: 'a2ui-options' }, legend, ...inputs.map(([, l]) => l));
      return [field, checkList(comp, ctx, field)].filter(Boolean);
    },
    Slider(comp, ctx) {
      const id = nextId('slider');
      const min = comp.min ?? 0;
      const input = el('input', { id, type: 'range', min, max: comp.max, step: comp.steps ? (comp.max - min) / comp.steps : 'any' });
      const out = el('output', { for: id });
      const label = el('label', { class: 'lab-label', for: id });
      watch(() => {
        label.textContent = toText(evaluate(comp.label, ctx));
        const v = Number(evaluate(comp.value, ctx));
        input.value = String(Number.isFinite(v) ? v : min);
        out.textContent = input.value;
      });
      input.addEventListener('input', () => { write(comp.value, ctx, Number(input.value)); refresh(); });
      return el('div', { class: 'lab-field' }, label, el('div', { class: 'a2ui-slider' }, input, out), ...[checkList(comp, ctx, input)].filter(Boolean));
    },
    DateTimeInput(comp, ctx) {
      const id = nextId('date');
      const type = comp.enableDate && !comp.enableTime ? 'date' : comp.enableTime && !comp.enableDate ? 'time' : 'datetime-local';
      const input = el('input', { id, type, class: 'lab-input' });
      const label = el('label', { class: 'lab-label', for: id });
      watch(() => {
        label.textContent = 'label' in comp ? toText(evaluate(comp.label, ctx)) : 'date';
        for (const key of ['min', 'max']) if (key in comp) input[key] = toText(evaluate(comp[key], ctx));
        const value = toText(evaluate(comp.value, ctx));
        if (input.value !== value) input.value = value;
      });
      input.addEventListener('input', () => { write(comp.value, ctx, input.value); refresh(); });
      return el('div', { class: 'lab-field' }, label, input, ...[checkList(comp, ctx, input)].filter(Boolean));
    },
  };

  function draw(id, ctx, stack, opts = {}) {
    const comp = surface.components.get(id);
    // The validator refuses cycles and deep trees; this guard keeps a bad state from recursing anyway.
    if (!comp || stack.includes(id) || stack.length > LIMITS.depth) return [];
    // Nested templates multiply: three lists of 200 would be 8 million nodes, so drawing stops at a budget.
    if (++drawn > LIMITS.drawn) {
      templateNote = `Stopped after ${LIMITS.drawn} components; nested lists make more than this playground draws.`;
      return [];
    }
    const node = RENDER[comp.component](comp, ctx, opts, [...stack, id]);
    const nodes = [node].flat();
    if (typeof comp.weight === 'number') nodes[0].style.flexGrow = String(comp.weight);
    // Field components draw a wrapper; their accessible name belongs on the control inside it.
    const target = ['TextField', 'Slider', 'DateTimeInput', 'CheckBox'].includes(comp.component) ? nodes[0].querySelector('input, textarea') || nodes[0] : nodes[0];
    accessibility(target, comp, ctx, nodes);
    return nodes;
  }

  const element = el('div', { class: 'a2ui-surface', 'data-surface': surface.id }, ...draw('root', scope('', undefined), []));
  return { element, refresh, note: templateNote };
}
