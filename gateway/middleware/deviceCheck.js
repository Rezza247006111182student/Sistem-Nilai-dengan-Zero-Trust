/**
 * gateway/middleware/deviceCheck.js — Kebutuhan 4.3: Verifikasi device terdaftar
 * Memeriksa X-Device-ID terdaftar untuk user (sub) di tabel devices.
 * Hanya berlaku untuk request user (bukan service).
 */

const pool = require('../../shared/db');

async function deviceCheck(req, res, next) {
  // Service token tidak perlu device check
  if (req.user && req.user.role === 'service') {
    return next();
  }

  const deviceId = req.headers['x-device-id'];
  if (!deviceId) {
    req.deviceError = 'device_not_registered';
    return next();
  }

  try {
    const [rows] = await pool.query(
      'SELECT id FROM devices WHERE user_id = ? AND device_id = ?',
      [req.user.sub, deviceId]
    );
    if (rows.length === 0) {
      req.deviceError = 'device_not_registered';
    }
  } catch (err) {
    req.deviceError = 'device_check_failed';
  }

  next();
}

module.exports = deviceCheck;

