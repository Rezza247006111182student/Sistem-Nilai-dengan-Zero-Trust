/**
 * gateway/middleware/verifyToken.js — Kebutuhan 4.1: Verifikasi JWT di gateway
 * Memeriksa header Authorization: Bearer <token>, verifikasi tanda tangan RS256.
 * Menyimpan decoded payload di req.user = { sub, role, ... }
 */

const { verifyToken } = require('../auth/tokens');

function verifyTokenMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.tokenError = 'token_missing';
    return next();
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { sub, role, iat, exp, iss, jti }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      req.tokenError = 'token_expired';
    } else {
      req.tokenError = 'token_invalid';
    }
    next();
  }
}

module.exports = verifyTokenMiddleware;

