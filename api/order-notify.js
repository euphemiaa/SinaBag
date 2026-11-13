/* POST /api/order-notify  {order:{code,total,name,phone,items}} — SMS alert to shop owner + customer */
const lib = require('./_lib');

let hourCount = 0, hourTs = 0;

module.exports = async function (req, res) {
  if (req.method !== 'POST') return lib.ok(res, { ok: false, error: 'method' });

  const b = await lib.readBody(req);
  const o = b.order || {};

  /* coupon usage +1 (best-effort, privileged server-side call) */
  if (b.coupon && process.env.SUPA_SECRET) {
    const adm = require('./_admin');
    const code = String(b.coupon).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
    if (code) adm.sjson('/rest/v1/rpc/increment_coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code })
    }).catch(function () {});
  }

  const now = Date.now();
  if (!lib.CFG.key || !lib.CFG.line) return lib.ok(res, { ok: false, error: 'sms-not-configured' });
  if (now - hourTs > 3600000) { hourTs = now; hourCount = 0; }
  if (++hourCount > 30) return lib.ok(res, { ok: false, error: 'rate' });

  const phone = lib.toEnDigits(o.phone || '').replace(/[^0-9]/g, '');
  const total = Number(o.total || 0).toLocaleString('en-US');
  const code = String(o.code || '').slice(0, 16).replace(/[^\w-]/g, '');
  const name = String(o.name || '').slice(0, 30);
  const sent = [];

  if (lib.validPhone(lib.toEnDigits(lib.CFG.owner))) {
    const text = 'سفارش جدید تولیدی سینا\nکد: ' + code + '\nمبلغ: ' + total + ' تومان\n' + name + ' — ' + phone;
    const r = await lib.sendBulk([lib.toEnDigits(lib.CFG.owner).replace(/[^0-9]/g, '')], text);
    if (r && r.status === 1) sent.push('owner');
  }

  if (lib.validPhone(phone)) {
    const text = 'تولیدی کیف سینا\nسفارش ' + code + ' به مبلغ ' + total + ' تومان ثبت شد.\nبرای هماهنگی با شما تماس می‌گیریم.';
    const r = await lib.sendBulk([phone], text);
    if (r && r.status === 1) sent.push('customer');
  }

  return lib.ok(res, { ok: sent.length > 0, sent: sent });
};
