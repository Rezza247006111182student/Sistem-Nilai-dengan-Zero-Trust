/**
 * gateway/policy.js — Kebutuhan 4.2: Policy Engine (PE) / Policy Administrator (PA)
 * Memutuskan allow/deny berdasarkan Tabel 3 di SPEC.md.
 * Kebijakan kepemilikan diputuskan dari DATABASE, bukan dari isi token.
 * Deny by default untuk endpoint yang tidak dikenali.
 */

const pool = require('../shared/db');
const config = require('./config');

/**
 * Periksa apakah sekarang dalam jam akses (WIB).
 * @returns {boolean}
 */
function isWithinAccessHours() {
  const now = new Date();
  // Konversi ke zona waktu yang dikonfigurasi
  const timeStr = now.toLocaleString('en-US', { timeZone: config.accessTimezone, hour12: false });
  const hour = parseInt(timeStr.split(' ')[1].split(':')[0]);
  // Kebutuhan 4.3: jam >= mulai DAN jam < selesai
  return hour >= config.accessHourStart && hour < config.accessHourEnd;
}

/**
 * Keputusan kebijakan akses.
 * @param {object} params
 * @param {string} params.method - HTTP method
 * @param {string} params.path - URL path (contoh: /nilai, /transkrip/2210001)
 * @param {object|null} params.user - decoded JWT { sub, role }
 * @param {object|null} params.query - query parameters
 * @returns {Promise<{allow: boolean, reason: string}>}
 */
async function decide({ method, path, user, query }) {
  const role = user ? user.role : null;
  const sub = user ? user.sub : null;

  // === GET /nilai ===
  if (method === 'GET' && path === '/nilai') {
    if (role === 'mahasiswa') {
      // Mahasiswa: hanya nilai miliknya — allow, filtering di service
      return { allow: true, reason: 'own_grades' };
    }
    if (role === 'dosen') {
      // Dosen: wajib kelas_id, kelas harus diampu
      if (!query || !query.kelas_id) {
        return { allow: false, reason: 'kelas_id_required' };
      }
      const [kelas] = await pool.query('SELECT dosen_id FROM kelas WHERE id = ?', [query.kelas_id]);
      if (kelas.length === 0) {
        return { allow: false, reason: 'class_not_taught' };
      }
      if (String(kelas[0].dosen_id) !== String(sub)) {
        return { allow: false, reason: 'class_not_taught' };
      }
      return { allow: true, reason: 'class_taught' };
    }
    // Admin dan role lain ditolak
    return { allow: false, reason: 'role_not_allowed' };
  }

  // === PUT /nilai/:id ===
  const putNilaiMatch = method === 'PUT' && /^\/nilai\/(\d+)$/.exec(path);
  if (putNilaiMatch) {
    if (role !== 'dosen') {
      return { allow: false, reason: 'role_not_allowed' };
    }
    const nilaiId = putNilaiMatch[1];

    // Kebutuhan 4.3: Periksa jam akses
    if (!isWithinAccessHours()) {
      return { allow: false, reason: 'outside_access_hours' };
    }

    // Periksa nilai ada dan milik kelas yang diampu
    const [nilaiRows] = await pool.query(
      `SELECT n.id, n.kelas_id, n.status, k.dosen_id
       FROM nilai n JOIN kelas k ON n.kelas_id = k.id
       WHERE n.id = ?`,
      [nilaiId]
    );
    if (nilaiRows.length === 0) {
      return { allow: false, reason: 'grade_not_found' };
    }
    if (String(nilaiRows[0].dosen_id) !== String(sub)) {
      return { allow: false, reason: 'class_not_taught' };
    }
    if (nilaiRows[0].status === 'final') {
      return { allow: false, reason: 'grade_already_final' };
    }
    return { allow: true, reason: 'grade_update_allowed' };
  }

  // === POST /kelas/:id/finalisasi ===
  const finalMatch = method === 'POST' && /^\/kelas\/(\d+)\/finalisasi$/.exec(path);
  if (finalMatch) {
    if (role !== 'dosen') {
      return { allow: false, reason: 'role_not_allowed' };
    }
    const kelasId = finalMatch[1];

    // Kebutuhan 4.3: Periksa jam akses
    if (!isWithinAccessHours()) {
      return { allow: false, reason: 'outside_access_hours' };
    }

    // Periksa kelas diampu
    const [kelas] = await pool.query('SELECT dosen_id FROM kelas WHERE id = ?', [kelasId]);
    if (kelas.length === 0) {
      return { allow: false, reason: 'class_not_taught' };
    }
    if (String(kelas[0].dosen_id) !== String(sub)) {
      return { allow: false, reason: 'class_not_taught' };
    }
    return { allow: true, reason: 'finalization_allowed' };
  }

  // === GET /transkrip/:nim ===
  const transkripMatch = method === 'GET' && /^\/transkrip\/([A-Za-z0-9]+)$/.exec(path);
  if (transkripMatch) {
    const nim = transkripMatch[1];

    if (role === 'admin') {
      // Admin: semua NIM
      return { allow: true, reason: 'admin_access' };
    }
    if (role === 'mahasiswa') {
      // Mahasiswa: hanya NIM sendiri — NIM dibaca dari DB, BUKAN dari token
      const [userRows] = await pool.query('SELECT nim FROM users WHERE id = ?', [sub]);
      if (userRows.length === 0 || userRows[0].nim !== nim) {
        return { allow: false, reason: 'not_own_nim' };
      }
      return { allow: true, reason: 'own_transcript' };
    }
    // Dosen dan role lain ditolak
    return { allow: false, reason: 'role_not_allowed' };
  }

  // === POST /transkrip/sinkron ===
  if (method === 'POST' && path === '/transkrip/sinkron') {
    if (role !== 'service') {
      return { allow: false, reason: 'service_token_required' };
    }
    return { allow: true, reason: 'service_sync' };
  }

  // Deny by default — endpoint tidak dikenali
  return { allow: false, reason: 'unknown_endpoint' };
}

module.exports = { decide, isWithinAccessHours };

