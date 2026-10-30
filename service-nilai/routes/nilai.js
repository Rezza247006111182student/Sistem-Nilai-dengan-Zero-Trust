/**
 * service-nilai/routes/nilai.js — Endpoint GET /nilai dan PUT /nilai/:id
 * Kebutuhan 4.2: Kebijakan akses ditegakkan di gateway (Policy Engine).
 * Service hanya memproses request yang sudah lolos gateway.
 */

const express = require('express');
const pool = require('../../shared/db');

const router = express.Router();

// GET /nilai — Kebutuhan 4.2: Mahasiswa hanya nilai miliknya, dosen hanya kelas yang diampu
router.get('/', async (req, res) => {
  try {
    const { role, sub } = req.user;

    if (role === 'mahasiswa') {
      // Mahasiswa: hanya nilai miliknya
      const [rows] = await pool.query(
        `SELECT n.id, n.kelas_id, k.kode AS kode_kelas, k.nama AS nama_kelas,
                n.nilai_angka, n.status, n.updated_at
         FROM nilai n JOIN kelas k ON n.kelas_id = k.id
         WHERE n.mahasiswa_id = ?`,
        [sub]
      );
      return res.json({ data: rows });
    }

    if (role === 'dosen') {
      // Dosen: kelas_id wajib (sudah diperiksa di gateway)
      const kelasId = req.query.kelas_id;
      const [rows] = await pool.query(
        `SELECT n.id, n.kelas_id, n.mahasiswa_id, u.nama AS nama_mahasiswa, u.nim,
                n.nilai_angka, n.status, n.updated_at
         FROM nilai n
         JOIN users u ON n.mahasiswa_id = u.id
         WHERE n.kelas_id = ?`,
        [kelasId]
      );
      return res.json({ data: rows });
    }

    return res.status(403).json({ error: 'role_not_allowed' });
  } catch (err) {
    console.error('[Service Nilai] GET /nilai error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /nilai/:id — Kebutuhan 4.2: Dosen mengubah nilai draft
router.put('/:id', express.json(), async (req, res) => {
  try {
    const nilaiId = req.params.id;
    const { nilai_angka } = req.body || {};

    if (nilai_angka === undefined || nilai_angka === null) {
      return res.status(400).json({ error: 'nilai_angka wajib diisi.' });
    }

    // Kebutuhan: status = 'draft' ditegakkan di level query (race condition safe)
    const [result] = await pool.query(
      `UPDATE nilai SET nilai_angka = ?, updated_at = NOW()
       WHERE id = ? AND status = 'draft'`,
      [nilai_angka, nilaiId]
    );

    if (result.affectedRows === 0) {
      // Bisa karena tidak ditemukan atau sudah final
      const [check] = await pool.query('SELECT id, status FROM nilai WHERE id = ?', [nilaiId]);
      if (check.length === 0) {
        return res.status(404).json({ error: 'grade_not_found' });
      }
      if (check[0].status === 'final') {
        return res.status(403).json({ error: 'grade_already_final' });
      }
      return res.status(400).json({ error: 'Gagal mengubah nilai.' });
    }

    // Ambil data terbaru
    const [updated] = await pool.query('SELECT * FROM nilai WHERE id = ?', [nilaiId]);
    res.json({ message: 'Nilai berhasil diubah.', data: updated[0] });
  } catch (err) {
    console.error('[Service Nilai] PUT /nilai/:id error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

