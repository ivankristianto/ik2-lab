// Live mode: one entry per provider with its request, reply and error shapes. The key is passed in per call and never kept.
import { BASIC_CATALOG, SUPPORTED } from './protocol.js';

const MAX_TOKENS = 8000;
const TIMEOUT_MS = 90_000;

export class ProviderError extends Error {}

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    host: 'api.anthropic.com',
    model: 'claude-haiku-5-5',
    keyHint: 'It starts with sk-ant- and lives in the Claude Console under API keys.',
    request: ({ model, key, system, prompt }) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Anthropic answers a browser request only with this opt-in.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: { model, max_tokens: MAX_TOKENS, system, messages: [{ role: 'user', content: prompt }] },
    }),
    reply: (data) => ({
      text: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
      cutOff: data.stop_reason === 'max_tokens',
    }),
  },
  openai: {
    label: 'OpenAI',
    host: 'api.openai.com',
    model: 'gpt-6-luna',
    keyHint: 'It starts with sk- and lives in the OpenAI platform under API keys.',
    request: ({ model, key, system, prompt }) => ({
      url: 'https://api.openai.com/v1/responses',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      // json_object needs a top-level object, so the prompt asks for {"messages": [...]}.
      body: { model, instructions: system, input: prompt, max_output_tokens: MAX_TOKENS * 2, text: { format: { type: 'json_object' } } },
    }),
    reply: (data) => ({
      text: (data.output || []).filter((o) => o.type === 'message').flatMap((o) => o.content || [])
        .filter((c) => c.type === 'output_text').map((c) => c.text).join(''),
      cutOff: data.status === 'incomplete',
    }),
  },
  gemini: {
    label: 'Google Gemini',
    host: 'generativelanguage.googleapis.com',
    model: 'gemini-3.5-flash-lite',
    keyHint: 'Create one in Google AI Studio under Get API key.',
    request: ({ model, key, system, prompt }) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      // In a header, never ?key=, so the key stays out of URLs and logs.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_TOKENS },
      },
    }),
    reply: (data) => {
      const cand = (data.candidates || [])[0] || {};
      return {
        text: ((cand.content || {}).parts || []).map((p) => p.text || '').join(''),
        cutOff: cand.finishReason === 'MAX_TOKENS',
        blocked: Boolean(data.promptFeedback && data.promptFeedback.blockReason) || cand.finishReason === 'SAFETY',
      };
    },
  },
};

export const SYSTEM_PROMPT = `You write A2UI v1.0 messages: JSON that describes a user interface for a renderer to draw.

Reply with one JSON object and nothing else: {"messages": [ ... ]}. No prose, no code fences.

Use exactly one message, a createSurface that carries the whole UI:
{"version": "1.0", "createSurface": {"surfaceId": "main", "catalogId": "${BASIC_CATALOG}", "dataModel": {...}, "components": [...]}}

Components are a flat list. Each has "id" (letters, digits, underscores; not starting with a digit) and "component" (its type). One component must have the id "root". Containers point at children by id.

Only these components exist here: ${SUPPORTED.join(', ')}. Never use Image, Icon, Video, AudioPlayer or Modal.
- Text: text, variant ("body" | "caption"). Start text with "# " for a heading.
- Row, Column: children (list of ids), justify, align.
- List: children, direction ("vertical" | "horizontal"). For a list from data use children {"componentId": "item_template", "path": "/items"}; inside the template, paths without a leading / are relative to the item.
- Card: child (one id). Tabs: tabs [{"title", "child"}]. Divider: axis.
- Button: child (id of a Text), variant ("default" | "primary" | "borderless"), action {"event": {"name": "...", "context": {...}}}.
- TextField: label, value, placeholder, variant ("shortText" | "longText" | "number" | "obscured").
- CheckBox: label, value (boolean). ChoicePicker: label, options [{"label", "value"}], value (list of strings), variant ("mutuallyExclusive" | "multipleSelection").
- Slider: label, min, max, value, steps. DateTimeInput: label, value (ISO 8601 string), enableDate, enableTime.

Bind values to the data model with {"@path": "/form/email"} and put starting values in dataModel. Inputs write back to their bound path.
Checks go on inputs and buttons: "@checks": [{"condition": {"@call": "email", "args": {"value": {"@path": "/form/email"}}}, "message": "Enter a valid email."}].
Functions available: required, email, length (min, max), numeric (min, max), and, or, not (values), formatString (only \${/path} placeholders), formatNumber, formatCurrency. No other functions.

Example:
{"messages": [{"version": "1.0", "createSurface": {"surfaceId": "main", "catalogId": "${BASIC_CATALOG}", "dataModel": {"form": {"email": ""}}, "components": [
{"id": "root", "component": "Card", "child": "col"},
{"id": "col", "component": "Column", "children": ["title", "email", "send"]},
{"id": "title", "component": "Text", "text": "# Join the list"},
{"id": "email", "component": "TextField", "label": "Email", "value": {"@path": "/form/email"}},
{"id": "send", "component": "Button", "child": "send_label", "variant": "primary", "action": {"event": {"name": "join", "context": {"email": {"@path": "/form/email"}}}}},
{"id": "send_label", "component": "Text", "text": "Join"}]}}]}`;

const MODEL_ID = /^[\w.:-]{1,80}$/;

// Status codes become our own sentences; provider bodies are never shown, since some echo part of the key.
function explain(p, status, data, model) {
  const err = (data && data.error) || {};
  const reason = JSON.stringify(err.details || '');
  if (p === PROVIDERS.anthropic && status === 401 && String(err.message || '').startsWith('CORS requests are not allowed')) {
    return 'Anthropic doesn\'t allow browser requests for your organisation (Zero Data Retention accounts can\'t use them). Try a key from another organisation.';
  }
  if (status === 401 || status === 403 || reason.includes('API_KEY_INVALID')) {
    return `${p.label} turned the key down (${status}). Check that you copied the whole key and that it hasn't been deleted or restricted.`;
  }
  if (status === 404) return `${p.label} doesn't know the model ${model} (404), or your key can't use it. Check the model ID.`;
  if (status === 400) return `${p.label} refused the request (400). The model ID may be wrong, or the model may not take this kind of request. Try the default model.`;
  if (status === 429) return `${p.label} is limiting requests on this key (429): too many at once, or no credit left. Wait a minute or check your billing.`;
  if (status >= 500) return `${p.label} had a problem on its side (${status}). Try again in a minute.`;
  return `${p.label} answered with an error (${status}). Try again, or try the default model.`;
}

/** Ask a provider for A2UI messages. Resolves to the reply text; throws ProviderError with a sentence for the page. */
export async function generate({ provider, model, key, prompt, fetchImpl = globalThis.fetch }) {
  const p = PROVIDERS[provider];
  if (!p) throw new ProviderError('Pick a provider first.');
  if (!key || !key.trim()) throw new ProviderError(`Paste your ${p.label} API key first. ${p.keyHint}`);
  if (!MODEL_ID.test(model || '')) throw new ProviderError('The model ID can only hold letters, digits, dots, colons, dashes and underscores.');
  if (!prompt || !prompt.trim()) throw new ProviderError('Describe the interface you want first.');
  const req = p.request({ model, key: key.trim(), system: SYSTEM_PROMPT, prompt: prompt.trim() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new ProviderError(`${p.label} didn't answer within ${TIMEOUT_MS / 1000} seconds. Try a shorter request or a faster model.`);
    throw new ProviderError(`The request didn't reach ${p.host}. Check your connection, or whether an extension or network filter blocks it.`);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new ProviderError(explain(p, res.status, data, model));
  if (!data) throw new ProviderError(`${p.label} sent a reply this page couldn't read. Try again.`);
  const out = p.reply(data);
  if (out.blocked) throw new ProviderError(`${p.label} declined to answer this prompt. Rephrase it and try again.`);
  if (!out.text.trim()) throw new ProviderError(`${p.label} sent an empty reply. Try again, or describe the interface in more detail.`);
  return { text: out.text, cutOff: out.cutOff };
}
