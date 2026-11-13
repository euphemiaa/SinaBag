/* POST /api/order-notify  {order:{code,total,name,phone,items}} — SMS alert to shop owner + customer */
const lib = require('./_lib');

let hourCount = 0, hourTs = 0;

module.exports = async function (req, res) {
  if (req.method !== 'POST') return lib.ok(res, { ok: false, error: 'method' });
  if (!lib.CFG.key || !lib.CFG.line) return lib.ok(res, { ok: false, error: 'sms-not-configured' });

  const b = await lib.readBody(req);
  const o = b.order || {};
  const now = Date.now();
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
