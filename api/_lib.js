/* SinaBag serverless helpers — SMS.ir REST + HMAC tokens (no secrets logged) */
const crypto = require('crypto');

const CFG = {
  key: process.env.SMS_IR_KEY || '',
  line: process.env.SMS_LINE_NUMBER || '',
  otpTemplate: process.env.SMS_OTP_TEMPLATE_ID || '',
  owner: process.env.OWNER_PHONE || '',
  secret: process.env.SMS_SECRET || ''
};

const API = 'https://api.sms.ir/v1';
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

function toEnDigits(s) {
  return String(s || '')
    .replace(/[۰-۹]/g, function (d) { return String(FA.indexOf(d)); })
    .replace(/[٠-٩]/g, function (d) { return String(AR.indexOf(d)); });
}

function validPhone(p) { return /^09[0-9]{9}$/.test(String(p || '')); }

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function hmacSign(data) {
  return b64u(crypto.createHmac('sha256', CFG.secret).update(data).digest());
}
function hmacCheck(data, sig) {
  try {
    const a = Buffer.from(hmacSign(data));
    const b = Buffer.from(String(sig || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

function sendBulk(mobiles, text) {
  return fetch(API + '/send/bulk', {
    method: 'POST',
    headers: { 'x-api-key': CFG.key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ lineNumber: Number(CFG.line), messageText: text, mobiles: mobiles, sendDateTime: null })
  }).then(function (r) { return r.json(); }).catch(function () { return { status: 0, message: 'network' }; });
}

function sendVerify(mobile, templateId, params) {
  return fetch(API + '/send/verify', {
    method: 'POST',
    headers: { 'x-api-key': CFG.key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ mobile: mobile, templateId: templateId, parameters: params })
  }).then(function (r) { return r.json(); }).catch(function () { return { status: 0, message: 'network' }; });
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let d = '';
    req.on('data', function (c) { d += c; if (d.length > 100000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', function () { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}

function ok(res, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(obj);
}

module.exports = { CFG, toEnDigits, validPhone, b64u, b64uDecode, hmacSign, hmacCheck, sendBulk, sendVerify, readBody, ok, crypto };
