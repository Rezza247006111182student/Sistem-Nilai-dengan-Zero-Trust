/**
 * service-transkrip/routes/transkrip.js — Endpoint GET /transkrip/:nim dan POST /transkrip/sinkron
 * Kebutuhan 4.2: Kebijakan akses ditegakkan di gateway.
 */

const express = require('express');
const pool = require('../../shared/db');

const router = express.Router();

// GET /transkrip/:nim — Kebutuhan 4.2: Mahasiswa hanya NIM sendiri, admin semua NIM
router.get('/:nim', async (req, res) => {
  try {
    const nim = req.params.nim;

    const [rows] = await pool.query(
      `SELECT id, nim, kelas_id, kode_mk, nama_mk, nilai_angka, nilai_huruf, synced_at
       FROM transkrip WHERE nim = ?
       ORDER BY synced_at DESC`,
      [nim]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('[Service Transkrip] GET /transkrip/:nim error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /transkrip/sinkron — Kebutuhan 4.2: Hanya token role: service
router.post('/sinkron', express.json(), async (req, res) => {
  try {
    // Kebutuhan 4.2: Pastikan role = service (double check di service)
    if (req.user.role !== 'service') {
      return res.status(403).json({ error: 'service_token_required' });
    }

    const { kelas_id, kode_mk, nama_mk, entries } = req.body || {};

    if (!kelas_id || !kode_mk || !nama_mk || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Payload sinkronisasi tidak lengkap.' });
    }

    // Upsert ke tabel transkrip (ON DUPLICATE KEY UPDATE)
    for (const entry of entries) {
      await pool.query(
        `INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, nilai_angka, nilai_huruf, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           kode_mk = VALUES(kode_mk),
           nama_mk = VALUES(nama_mk),
           nilai_angka = VALUES(nilai_angka),
           nilai_huruf = VALUES(nilai_huruf),
           synced_at = NOW()`,
        [entry.nim, kelas_id, kode_mk, nama_mk, entry.nilai_angka, entry.nilai_huruf]
      );
    }

    res.json({ message: 'Sinkronisasi transkrip berhasil.', count: entries.length });
  } catch (err) {
    console.error('[Service Transkrip] POST /transkrip/sinkron error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

