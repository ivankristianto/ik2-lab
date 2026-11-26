import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateHost, readPageUrl, safeUrl } from '../url.js';

test('safeUrl keeps http and https only', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('/a', 'https://example.com/b'), 'https://example.com/a');
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', '', null, 42]) {
    assert.equal(safeUrl(bad, 'https://example.com/'), null, String(bad));
  }
});

test('private, loopback, link-local and local names are refused before any lookup', () => {
  for (const input of ['http://localhost/', 'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://10.0.0.5/', 'http://172.16.0.1/', 'http://192.168.1.10/admin', 'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://printer.local/', 'http://intranet/']) {
    assert.equal(readPageUrl(input).error, 'private-url', input);
  }
  assert.equal(isPrivateHost('www.ivankristianto.com'), false);
  assert.equal(isPrivateHost('8.8.8.8'), false);
});

test('reads plain addresses and rejects junk', () => {
  assert.equal(readPageUrl('example.com/post').url, 'https://example.com/post');
  assert.equal(readPageUrl('').error, 'empty-url');
  assert.equal(readPageUrl('javascript:alert(1)').error, 'invalid-url');
  assert.equal(readPageUrl('https://user:pass@example.com/').error, 'invalid-url');
});
