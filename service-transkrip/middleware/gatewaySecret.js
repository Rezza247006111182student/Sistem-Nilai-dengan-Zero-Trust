/**
 * service-transkrip/middleware/gatewaySecret.js — Kebutuhan 4.1: Verifikasi gateway secret
 * Identik dengan service-nilai, service menolak request tanpa gateway secret valid.
 */

const crypto = require('crypto');

function verifyGatewaySecret(req, res, next) {
  const secret = req.headers['x-gateway-secret'];
  const expected = process.env.GATEWAY_SECRET;

  if (!secret || !expected) {
    return res.status(403).json({ error: 'Akses langsung tidak diizinkan.' });
  }

  const secretBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(expected);

  // Kebutuhan 4.1: timingSafeEqual untuk mencegah timing attack
  if (secretBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(secretBuf, expectedBuf)) {
    return res.status(403).json({ error: 'Akses langsung tidak diizinkan.' });
  }

  next();
}

module.exports = verifyGatewaySecret;

