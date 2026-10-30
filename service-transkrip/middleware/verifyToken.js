/**
 * service-transkrip/middleware/verifyToken.js — Kebutuhan 4.1: Verifikasi ulang JWT di service
 * Service Transkrip memverifikasi ulang tanda tangan dan masa berlaku token dengan PUBLIC key.
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const publicKey = fs.readFileSync(path.resolve(process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem'), 'utf8');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ada.' });
  }

  const token = authHeader.slice(7);
  try {
    // Kebutuhan 4.1: Wajib set algorithms: ['RS256']
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'sistem-nilai-gateway' });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid.' });
  }
}

module.exports = verifyToken;

