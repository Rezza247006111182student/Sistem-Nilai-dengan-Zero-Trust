/**
 * gateway/audit.js — Kebutuhan 4.4: Pencatatan audit log
 * Setiap keputusan akses (allow/deny) dicatat ke tabel audit_log.
 * Tidak pernah mencatat password atau token di log.
 */

const pool = require('../shared/db');

/**
 * Catat satu entri audit log.
 * @param {object} entry
 * @param {string} entry.subjectType - 'user' | 'service' | 'anonymous'
 * @param {string|null} entry.subjectId - user id atau client_id
 * @param {string} entry.endpoint - "METHOD /path"
 * @param {string|null} entry.deviceId - X-Device-ID
 * @param {string} entry.hasil - 'allow' | 'deny'
 * @param {string} entry.alasan - alasan keputusan
 */
async function logAudit({ subjectType, subjectId, endpoint, deviceId, hasil, alasan }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (waktu, subject_type, subject_id, endpoint, device_id, hasil, alasan)
       VALUES (NOW(3), ?, ?, ?, ?, ?, ?)`,
      [subjectType, subjectId || null, endpoint, deviceId || null, hasil, alasan || null]
    );
  } catch (err) {
    // Jangan sampai audit error menghentikan request, tapi log ke console
    console.error('[AUDIT ERROR]', err.message);
  }
}

module.exports = { logAudit };

