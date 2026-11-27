// What a renderer sends back to the agent besides an action: error messages and the data model. No DOM here.

/**
 * The A2UI error messages a renderer sends for validation problems, one per problem.
 * A problem that belongs to no surface (a parse error, an unknown surface type) has nothing to address, so it is left out.
 */
export function errorMessages(messages, errors) {
  const out = [];
  for (const err of errors || []) {
    const m = /^\/(\d+)\/(\w+)(\/.*)?$/.exec(String(err.path || ''));
    const message = m && Array.isArray(messages) ? messages[Number(m[1])] : undefined;
    if (!message || typeof message !== 'object') continue;
    // The pointer is either inside the message body (/0/createSurface/...) or on the envelope (/0/version).
    const inBody = message[m[2]] && typeof message[m[2]] === 'object' && 'surfaceId' in message[m[2]];
    const body = inBody ? message[m[2]] : Object.values(message).find((v) => v && typeof v === 'object' && typeof v.surfaceId === 'string');
    const surfaceId = body && typeof body.surfaceId === 'string' ? body.surfaceId : null;
    if (!surfaceId) continue;
    out.push({ version: '1.0', error: { code: 'VALIDATION_FAILED', surfaceId, path: inBody ? m[3] || '/' : '/', message: err.message } });
  }
  return out;
}

/** The transport metadata that carries a surface's whole data model when it was created with sendDataModel, or null. */
export function dataModelMetadata(surface) {
  if (!surface || !surface.sendDataModel) return null;
  return { a2uiRendererDataModel: { version: '1.0', surfaces: { [surface.id]: structuredClone(surface.dataModel) } } };
}
