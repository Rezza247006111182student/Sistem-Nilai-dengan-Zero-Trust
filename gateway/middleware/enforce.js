/**
 * gateway/middleware/enforce.js — Kebutuhan 4.2: PEP (Policy Enforcement Point)
 * Urutan: verifikasi token → device check → policy engine → audit → proxy
 * Deny by default.
 */

const { logAudit } = require('../audit');
const { decide } = require('../policy');

async function enforce(req, res, next) {
  // req.path di middleware yang di-mount (app.use('/transkrip', ...)) bersifat relatif,
  // sehingga harus memakai originalUrl agar Policy Engine menerima path lengkap.
  const pathOnly = req.originalUrl.split('?')[0];
  const endpoint = `${req.method} ${pathOnly}`;
  const deviceId = req.headers['x-device-id'] || null;

  // 1. Token tidak valid → 401
  if (req.tokenError) {
    const subjectType = 'anonymous';
    await logAudit({ subjectType, subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: req.tokenError });
    return res.status(401).json({ error: 'Token tidak valid atau tidak ada.' });
  }

  if (!req.user) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: 'token_missing' });
    return res.status(401).json({ error: 'Token tidak valid atau tidak ada.' });
  }

  const subjectType = req.user.role === 'service' ? 'service' : 'user';
  const subjectId = req.user.sub;

  // 2. Device check gagal → 403 (hanya untuk user, bukan service)
  if (req.deviceError) {
    await logAudit({ subjectType, subjectId, endpoint, deviceId, hasil: 'deny', alasan: req.deviceError });
    return res.status(403).json({ error: 'Device tidak terdaftar.' });
  }

  // 3. Policy Engine memutuskan allow/deny
  const decision = await decide({
    method: req.method,
    path: pathOnly,
    user: req.user,
    query: req.query,
  });

  if (!decision.allow) {
    await logAudit({ subjectType, subjectId, endpoint, deviceId, hasil: 'deny', alasan: decision.reason });
    // Tentukan HTTP status berdasarkan alasan
    let status = 403;
    if (decision.reason === 'grade_not_found') status = 404;
    return res.status(status).json({ error: decision.reason });
  }

  // 4. Allow: audit, lalu lanjut ke proxy
  await logAudit({ subjectType, subjectId, endpoint, deviceId, hasil: 'allow', alasan: decision.reason });

  // Hapus header X-Gateway-Secret dari client sebelum proxy menambahkan miliknya
  delete req.headers['x-gateway-secret'];

  next();
}

module.exports = enforce;

