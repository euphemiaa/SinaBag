/* SinaBag admin helpers — signed HttpOnly session cookie + privileged Supabase REST (server only) */
const lib = require('./_lib');
const crypto = require('crypto');

const SUPA_URL = 'https://pcjmzutugtsqaqubcwmt.supabase.co';
const SKEY = process.env.SUPA_SECRET || '';
const PASS = process.env.ADMIN_PASS || '';
const COOKIE = 'sb_adm';
const TTL = 12 * 3600 * 1000; /* 12h */

function sign(data) {
  return lib.b64u(crypto.createHmac('sha256', PASS || 'sinabag').update(data).digest());
}
function sigOk(data, sig) {
  try {
    const a = Buffer.from(sign(data));
    const b = Buffer.from(String(sig || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function adminOk(req) {
  if (!PASS) return false;
  const tok = parseCookies(req)[COOKIE];
  if (!tok) return false;
  const i = tok.lastIndexOf('.');
  if (i < 1) return false;
  const payload = tok.slice(0, i), sig = tok.slice(i + 1);
  if (!sigOk(payload, sig)) return false;
  const exp = Number(lib.b64uDecode(payload).toString('utf8'));
  return exp > Date.now();
}
function setSession(res) {
  const payload = lib.b64u(Buffer.from(String(Date.now() + TTL)));
  res.setHeader('Set-Cookie', COOKIE + '=' + payload + '.' + sign(payload) + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + Math.floor(TTL / 1000));
}
function clearSession(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
}
/* readBody with a bigger cap (uploads) */
function readBig(req, cap) {
  return new Promise(function (resolve) {
    let d = '';
    req.on('data', function (c) { d += c; if (d.length > (cap || 3500000)) { d = ''; req.destroy(); resolve({}); } });
    req.on('end', function () { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}
/* privileged Supabase REST — service-level key, never exposed to the browser */
async function sjson(path, opts) {
  opts = opts || {};
  try {
    const r = await fetch(SUPA_URL + path, {
      method: opts.method || 'GET',
      headers: Object.assign({ 'apikey': SKEY, 'Authorization': 'Bearer ' + SKEY }, opts.headers || {}),
      body: opts.body
    });
    const t = await r.text();
    let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
    return { status: r.status, ok: r.ok, body: j, text: t };
  } catch (e) { return { status: 0, ok: false, body: null, text: String(e) }; }
}
function deny(res) { return res.status(401).json({ ok: false, error: 'no-session' }); }

module.exports = { SUPA_URL, SKEY, adminOk, setSession, clearSession, sjson, readBig, deny, ok: lib.ok, readBody: lib.readBody };
