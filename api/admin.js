/* POST /api/admin {action:...} — single router: admin panel operations + public actions
   (Hobby plan cap of 12 functions; all admin ops share one serverless function) */
const crypto = require('crypto');
const adm = require('./_admin');

const STS = ['pending', 'sewing', 'shipped', 'delivered', 'canceled'];
let fails = 0, failTs = 0;

function prodRow(p) {
  return {
    id: String(p.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40),
    name: String(p.name || '').slice(0, 120),
    cat: String(p.cat || 'کیف پارچه‌ای').slice(0, 60),
    price: Math.max(0, parseInt(p.price, 10) || 0),
    old: Math.max(0, parseInt(p.old, 10) || 0),
    rating: String(p.rating || '۴٫۸').slice(0, 8),
    reviews: Math.max(0, parseInt(p.reviews, 10) || 0),
    img: String(p.img || '').slice(0, 300),
    tag: String(p.tag || '').slice(0, 40),
    inst: !!p.inst,
    colors: Array.isArray(p.colors) ? p.colors.map(function (c) { return String(c).slice(0, 40); }) : [],
    descr: String(p.descr || '').slice(0, 4000),
    specs: Array.isArray(p.specs) ? p.specs.slice(0, 20) : [],
    stock: Math.max(0, parseInt(p.stock, 10) || 0),
    active: p.active !== false,
    sort: parseInt(p.sort, 10) || 100,
    updated_at: new Date().toISOString()
  };
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  const b = await adm.readBig(req);
  const a = String(b.action || '');

  /* ---- public: session check ---- */
  if (a === 'session') return adm.ok(res, { ok: adm.adminOk(req) });

  /* ---- public: wholesale inquiry (anon insert through RLS-guarded REST) ---- */
  if (a === 'inquiry') {
    const row = {
      name: String(b.name || '').slice(0, 80),
      phone: String(b.phone || '').replace(/[^0-9+]/g, '').slice(0, 16),
      product: String(b.product || '').slice(0, 80),
      qty: Math.min(1000000, Math.max(0, parseInt(b.qty, 10) || 0)),
      color: String(b.color || '').slice(0, 60),
      print_logo: !!b.print_logo,
      note: String(b.note || '').slice(0, 2000)
    };
    if (!row.name || row.phone.length < 10) return res.status(400).json({ ok: false, error: 'bad-input' });
    const r = await adm.sjson('/rest/v1/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify(row)
    });
    return adm.ok(res, { ok: r.ok });
  }

  /* ---- public: coupon validation for the cart ---- */
  if (a === 'coupon-check') {
    const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
    const sub = Math.max(0, parseInt(b.sub, 10) || 0);
    if (!code) return adm.ok(res, { ok: false, reason: 'empty' });
    const r = await adm.sjson('/rest/v1/coupons?code=eq.' + encodeURIComponent(code) + '&select=percent,max_uses,used,min_total,expires,active');
    if (!r.ok || !Array.isArray(r.body) || !r.body.length) return adm.ok(res, { ok: false, reason: 'not-found' });
    const c = r.body[0];
    if (!c.active) return adm.ok(res, { ok: false, reason: 'inactive' });
    if (c.expires && new Date(c.expires).getTime() < Date.now()) return adm.ok(res, { ok: false, reason: 'expired' });
    if (c.max_uses > 0 && c.used >= c.max_uses) return adm.ok(res, { ok: false, reason: 'used-up' });
    if (c.min_total > 0 && sub < c.min_total) return adm.ok(res, { ok: false, reason: 'min-total', min: c.min_total });
    return adm.ok(res, { ok: true, code: code, percent: c.percent });
  }

  /* ---- public: login (rate-limited) ---- */
  if (a === 'login') {
    const now = Date.now();
    if (now - failTs > 600000) { failTs = now; fails = 0; }
    if (fails > 12) return res.status(429).json({ ok: false, error: 'too-many-tries' });
    const pass = String(b.pass || '');
    const P = String(process.env.ADMIN_PASS || '');
    const x = Buffer.from(pass), y = Buffer.from(P);
    const good = P.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
    if (!good) { fails++; return res.status(401).json({ ok: false, error: 'wrong-pass' }); }
    fails = 0;
    adm.setSession(res);
    return adm.ok(res, { ok: true });
  }

  /* ---- everything below requires the admin session ---- */
  if (!adm.adminOk(req)) return adm.deny(res);

  if (a === 'logout') { adm.clearSession(res); return adm.ok(res, { ok: true }); }

  if (a === 'orders') {
    const r = await adm.sjson('/rest/v1/orders?select=order_code,created_at,customer_name,phone,province,city,address,postal_code,note,items,subtotal,shipping,total,status&order=created_at.desc&limit=300');
    if (!r.ok) return res.status(502).json({ ok: false, error: 'db' });
    return adm.ok(res, { ok: true, orders: r.body || [] });
  }

  if (a === 'order-status') {
    const code = String(b.code || '').replace(/[^\w-]/g, '').slice(0, 24);
    const st = String(b.status || '');
    if (!code || STS.indexOf(st) < 0) return res.status(400).json({ ok: false, error: 'bad-input' });
    const r = await adm.sjson('/rest/v1/orders?order_code=eq.' + encodeURIComponent(code), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: st })
    });
    return adm.ok(res, { ok: r.ok });
  }

  if (a === 'products') {
    const r = await adm.sjson('/rest/v1/products?select=*&order=sort.asc,id.asc');
    return adm.ok(res, { ok: r.ok, products: r.body || [] });
  }

  if (a === 'save-product') {
    if (b.del) {
      const id = String(b.id || '').slice(0, 40);
      const r = await adm.sjson('/rest/v1/products?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
      return adm.ok(res, { ok: r.ok });
    }
    const p = prodRow(b.p || {});
    if (!p.id || !p.name) return res.status(400).json({ ok: false, error: 'need id+name' });
    const r = await adm.sjson('/rest/v1/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(p)
    });
    return adm.ok(res, { ok: r.ok, status: r.status, id: p.id });
  }

  if (a === 'posts') {
    const r = await adm.sjson('/rest/v1/posts?select=slug,title,excerpt,img,published,created_at&order=created_at.desc&limit=100');
    return adm.ok(res, { ok: r.ok, posts: r.body || [] });
  }

  if (a === 'save-post') {
    if (b.del) {
      const slug = String(b.slug || '').slice(0, 80);
      const r = await adm.sjson('/rest/v1/posts?slug=eq.' + encodeURIComponent(slug), { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
      return adm.ok(res, { ok: r.ok });
    }
    const p = b.p || {};
    const row = {
      slug: String(p.slug || '').trim().replace(/\s+/g, '-').slice(0, 80),
      title: String(p.title || '').slice(0, 160),
      excerpt: String(p.excerpt || '').slice(0, 300),
      body: String(p.body || '').slice(0, 30000),
      img: String(p.img || '').slice(0, 300),
      published: p.published !== false
    };
    if (!row.slug || !row.title) return res.status(400).json({ ok: false, error: 'need slug+title' });
    const r = await adm.sjson('/rest/v1/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row)
    });
    return adm.ok(res, { ok: r.ok, status: r.status, slug: row.slug });
  }

  if (a === 'coupons') {
    const r = await adm.sjson('/rest/v1/coupons?select=*&order=code.asc');
    return adm.ok(res, { ok: r.ok, coupons: r.body || [] });
  }

  if (a === 'save-coupon') {
    if (b.del) {
      const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
      const r = await adm.sjson('/rest/v1/coupons?code=eq.' + encodeURIComponent(code), { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
      return adm.ok(res, { ok: r.ok });
    }
    const p = b.p || {};
    const row = {
      code: String(p.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24),
      percent: Math.min(90, Math.max(1, parseInt(p.percent, 10) || 10)),
      max_uses: Math.max(0, parseInt(p.max_uses, 10) || 0),
      min_total: Math.max(0, parseInt(p.min_total, 10) || 0),
      expires: p.expires ? String(p.expires) : null,
      active: p.active !== false
    };
    if (!row.code) return res.status(400).json({ ok: false, error: 'need code' });
    const r = await adm.sjson('/rest/v1/coupons', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row)
    });
    return adm.ok(res, { ok: r.ok, status: r.status, code: row.code });
  }

  if (a === 'inquiries') {
    const r = await adm.sjson('/rest/v1/inquiries?select=*&order=created_at.desc&limit=200');
    return adm.ok(res, { ok: r.ok, inquiries: r.body || [] });
  }

  if (a === 'inquiry-status') {
    const id = parseInt(b.id, 10);
    const st = String(b.status || '');
    if (!id || ['new', 'contacted', 'closed'].indexOf(st) < 0) return res.status(400).json({ ok: false, error: 'bad-input' });
    const r = await adm.sjson('/rest/v1/inquiries?id=eq.' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: st })
    });
    return adm.ok(res, { ok: r.ok });
  }

  if (a === 'upload') {
    const data = String(b.data || '');
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!m) return res.status(400).json({ ok: false, error: 'bad-image' });
    const mime = m[1], buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2200000) return res.status(400).json({ ok: false, error: 'too-large' });
    let name = String(b.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'img';
    name = name + '-' + Date.now().toString(36) + '.' + (mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg'));
    const r = await fetch(adm.SUPA_URL + '/storage/v1/object/product-imgs/' + name, {
      method: 'POST',
      headers: { 'apikey': adm.SKEY, 'Authorization': 'Bearer ' + adm.SKEY, 'Content-Type': mime, 'x-upsert': 'true' },
      body: buf
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ ok: false, error: 'storage', detail: t.slice(0, 200) }); }
    return adm.ok(res, { ok: true, url: adm.SUPA_URL + '/storage/v1/object/public/product-imgs/' + name });
  }

  return res.status(400).json({ ok: false, error: 'unknown-action' });
};
