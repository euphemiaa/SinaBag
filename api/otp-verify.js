/* POST /api/otp-verify  {phone, code, token} -> {ok} — stateless HMAC OTP check */
const lib = require('./_lib');

module.exports = async function (req, res) {
  if (req.method !== 'POST') return lib.ok(res, { ok: false, error: 'method' });
  if (!lib.CFG.secret) return lib.ok(res, { ok: false, error: 'not-configured' });

  const b = await lib.readBody(req);
  const phone = lib.toEnDigits(b.phone).replace(/[^0-9]/g, '');
  const code = lib.toEnDigits(b.code).replace(/[^0-9]/g, '');
  const parts = String(b.token || '').split('.');
  if (parts.length !== 2) return lib.ok(res, { ok: false, error: 'نشست نامعتبر است؛ دوباره کد بگیرید.' });

  let pl;
  try { pl = JSON.parse(lib.b64uDecode(parts[0]).toString('utf8')); }
  catch (e) { return lib.ok(res, { ok: false, error: 'نشست نامعتبر است؛ دوباره کد بگیرید.' }); }

  if (!lib.hmacCheck(parts[0], parts[1])) return lib.ok(res, { ok: false, error: 'نشست نامعتبر است؛ دوباره کد بگیرید.' });
  if (Date.now() > pl.exp) return lib.ok(res, { ok: false, error: 'کد منقضی شده؛ کد جدید بگیرید.' });
  if (pl.phone !== phone) return lib.ok(res, { ok: false, error: 'شمارهٔ موبایل با نشست مطابقت ندارد.' });

  const a = Buffer.from(String(pl.code));
  const c = Buffer.from(String(code || ''));
  const good = a.length === c.length && lib.crypto.timingSafeEqual(a, c);
  if (!good) return lib.ok(res, { ok: false, error: 'کد واردشده درست نیست.' });

  return lib.ok(res, { ok: true });
};
