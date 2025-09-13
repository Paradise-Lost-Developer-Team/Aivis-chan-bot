const fs = require('fs');
const path = require('path');
const server = require('../server.js');

// We will invoke tryDecodeBase64Json and the callback parsing logic indirectly
// But server.js does not export functions. Instead, duplicate minimal parsing logic here

function tryDecodeBase64Json(s) {
  try {
    const buf = Buffer.from(String(s), 'base64');
    const txt = buf.toString('utf8');
    if (!txt) return null;
    try {
      const obj = JSON.parse(txt);
      return obj && obj.discordId ? String(obj.discordId) : null;
    } catch (e) {
      const plain = String(txt).trim();
      if (/^\d{5,22}$/.test(plain)) return plain;
      return null;
    }
  } catch (e) { return null; }
}

function parseState(state) {
  let discordId = null;
  let guildId = undefined;
  try {
    const txt = Buffer.from(String(state), 'base64').toString('utf8');
    const parsed = JSON.parse(txt);
    if (parsed && parsed.discordId) {
      discordId = String(parsed.discordId);
      if (parsed.guildId) guildId = String(parsed.guildId);
    }
  } catch (e) {}

  if (!discordId && String(state).includes(':')) {
    const left = String(state).split(':', 1)[0];
    const tryDecoded = tryDecodeBase64Json(left);
    if (tryDecoded) discordId = tryDecoded;
    else if (/^\d{5,22}$/.test(left)) discordId = left;
  }

  if (!discordId) {
    const directDecoded = tryDecodeBase64Json(state);
    if (directDecoded) discordId = directDecoded;
    else if (/^\d{5,22}$/.test(String(state))) discordId = String(state);
  }

  return { discordId, guildId };
}

const tests = [
  { name: 'plain-colon', state: '123456789012345678:abcdef', expect: '123456789012345678' },
  { name: 'plain-only', state: '123456789012345678', expect: '123456789012345678' },
  { name: 'base64-json', state: Buffer.from(JSON.stringify({ discordId: '999888777666555444', guildId: 'guild123' })).toString('base64'), expect: '999888777666555444' },
  { name: 'base64-numeric', state: Buffer.from('123456789012345678').toString('base64'), expect: '123456789012345678' },
  { name: 'legacy-left-base64', state: Buffer.from('123456789012345678').toString('base64') + ':rand', expect: '123456789012345678' },
  { name: 'weird-nonid', state: 'not-an-id', expect: null }
];

for (const t of tests) {
  const out = parseState(t.state);
  console.log(t.name, '->', out, 'expected:', t.expect);
}
