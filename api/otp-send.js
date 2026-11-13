/* POST /api/otp-send  {phone} -> {ok, token, ttl, demo?} — SMS.ir send; falls back to universal demo code when SMS is unavailable */
const lib = require('./_lib');

/* Demo fallback: when SMS key/line is missing or the send fails, issue a ticket
   for the universal code below so the phone-login flow stays testable.
   As soon as SMS works again, real random codes are sent automatically. */
const DEMO_CODE = '1111';

const lastSend = new Map(); // phone -> ts (best-effort per-instance cooldown)
let hourCount = 0, hourTs = 0;

module.exports = async function (req, res) {
  if (req.method !== 'POST') return lib.ok(res, { ok: false, error: 'method' });
  if (!lib.CFG.secret) return lib.ok(res, { ok: false, error: 'sms-not-configured' });

  const b = await lib.readBody(req);
  const phone = lib.toEnDigits(b.phone).replace(/[^0-9]/g, '');
  if (!lib.validPhone(phone)) return lib.ok(res, { ok: false, error: 'شمارهٔ موبایل معتبر نیست — با ۰۹ شروع می‌شود و ۱۱ رقم است.' });

  const now = Date.now();
  if (now - hourTs > 3600000) { hourTs = now; hourCount = 0; }
  if (++hourCount > 30) return lib.ok(res, { ok: false, error: 'حجم درخواست زیاد است؛ کمی بعد تلاش کنید.' });

  function ticket(code, demo) {
    const payload = { phone: phone, code: code, exp: now + 180000, n: now.toString(36) + Math.random().toString(36).slice(2, 8), demo: !!demo };
    const p = lib.b64u(JSON.stringify(payload));
    return { ok: true, token: p + '.' + lib.hmacSign(p), ttl: 180, demo: !!demo };
  }

  // demo path: SMS not configured at all (no key, and no template/line)
  if (!lib.CFG.key || (!lib.CFG.otpTemplate && !lib.CFG.line)) return lib.ok(res, ticket(DEMO_CODE, true));

  // credit guards for real sends: 60s per phone
  const prev = lastSend.get(phone) || 0;
  if (now - prev < 60000) return lib.ok(res, { ok: false, error: 'کد قبلاً ارسال شده؛ ۶۰ ثانیه بعد دوباره تلاش کنید.', wait: 60 });

  const code = String(lib.crypto.randomInt(100000, 999999));

  let r;
  if (lib.CFG.otpTemplate) {
    r = await lib.sendVerify(phone, Number(lib.CFG.otpTemplate), [{ name: 'code', value: code }]);
  } else if (lib.CFG.line) {
    const text = 'تولیدی کیف سینا\nکد ورود: ' + code + '\nاین کد ۳ دقیقه اعتبار دارد.';
    r = await lib.sendBulk([phone], text);
  } else {
    return lib.ok(res, ticket(DEMO_CODE, true));
  }

  if (r && r.status === 1) {
    lastSend.set(phone, now);
    return lib.ok(res, ticket(code, false));
  }
  // send failed (line invalid / no credit / network) -> demo fallback keeps the flow usable
  return lib.ok(res, ticket(DEMO_CODE, true));
};
