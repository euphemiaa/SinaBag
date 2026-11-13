/* POST /api/otp-send  {phone} -> {ok, token, ttl} — sends 6-digit OTP via SMS.ir */
const lib = require('./_lib');

const lastSend = new Map(); // phone -> ts (best-effort per-instance cooldown)
let hourCount = 0, hourTs = 0;

module.exports = async function (req, res) {
  if (req.method !== 'POST') return lib.ok(res, { ok: false, error: 'method' });
  if (!lib.CFG.key) return lib.ok(res, { ok: false, error: 'sms-not-configured' });

  const b = await lib.readBody(req);
  const phone = lib.toEnDigits(b.phone).replace(/[^0-9]/g, '');
  if (!lib.validPhone(phone)) return lib.ok(res, { ok: false, error: 'شمارهٔ موبایل معتبر نیست — با ۰۹ شروع می‌شود و ۱۱ رقم است.' });

  const now = Date.now();
  // credit guards: 60s per phone, 30 sends per instance per hour
  const prev = lastSend.get(phone) || 0;
  if (now - prev < 60000) return lib.ok(res, { ok: false, error: 'کد قبلاً ارسال شده؛ ۶۰ ثانیه بعد دوباره تلاش کنید.', wait: 60 });
  if (now - hourTs > 3600000) { hourTs = now; hourCount = 0; }
  if (++hourCount > 30) return lib.ok(res, { ok: false, error: 'حجم درخواست زیاد است؛ کمی بعد تلاش کنید.' });

  const code = String(lib.crypto.randomInt(100000, 999999));
  const payload = { phone: phone, code: code, exp: now + 180000, n: now.toString(36) + Math.random().toString(36).slice(2, 8) };
  const p = lib.b64u(JSON.stringify(payload));
  const token = p + '.' + lib.hmacSign(p);

  let r;
  if (lib.CFG.otpTemplate) {
    r = await lib.sendVerify(phone, Number(lib.CFG.otpTemplate), [{ name: 'code', value: code }]);
  } else if (lib.CFG.line) {
    const text = 'تولیدی کیف سینا\nکد ورود: ' + code + '\nاین کد ۳ دقیقه اعتبار دارد.';
    r = await lib.sendBulk([phone], text);
  } else {
    return lib.ok(res, { ok: false, error: 'sms-not-configured' });
  }

  if (r && r.status === 1) {
    lastSend.set(phone, now);
    return lib.ok(res, { ok: true, token: token, ttl: 180 });
  }
  return lib.ok(res, { ok: false, error: 'ارسال پیامک ناموفق بود؛ چند لحظه بعد دوباره تلاش کنید.', detail: r ? r.message : 'no-response' });
};
