/**
 * service-nilai/routes/kelas.js — Endpoint POST /kelas/:id/finalisasi
 * Kebutuhan 4.2: Alur finalisasi dengan transaksi dan rollback
 * Mengacu pada SPEC.md bagian 8.
 */

const express = require('express');
const pool = require('../../shared/db');
const { syncTranskrip } = require('../serviceClient');

const router = express.Router();

/**
 * Konversi nilai angka ke huruf.
 * >= 80: A, >= 70: B, >= 60: C, >= 50: D, selainnya: E
 */
function convertToGrade(nilaiAngka) {
  if (nilaiAngka >= 80) return 'A';
  if (nilaiAngka >= 70) return 'B';
  if (nilaiAngka >= 60) return 'C';
  if (nilaiAngka >= 50) return 'D';
  return 'E';
}

// POST /kelas/:id/finalisasi — Kebutuhan 4.2: Finalisasi kelas
router.post('/:id/finalisasi', async (req, res) => {
  const kelasId = req.params.id;
  const conn = await pool.getConnection();

  try {
    // Langkah 1: BEGIN transaksi
    await conn.beginTransaction();

    // Langkah 2: SELECT FOR UPDATE semua nilai kelas ini
    const [nilaiRows] = await conn.query(
      `SELECT n.id, n.mahasiswa_id, n.nilai_angka, n.status, u.nim
       FROM nilai n JOIN users u ON n.mahasiswa_id = u.id
       WHERE n.kelas_id = ?
       FOR UPDATE`,
      [kelasId]
    );

    if (nilaiRows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: 'Tidak ada nilai di kelas ini.' });
    }

    // Ubah status = 'final' untuk yang masih draft
    const draftIds = nilaiRows.filter(n => n.status === 'draft').map(n => n.id);
    if (draftIds.length > 0) {
      await conn.query(
        `UPDATE nilai SET status = 'final', updated_at = NOW() WHERE id IN (${draftIds.map(() => '?').join(',')})`,
        draftIds
      );
    }

    // Ambil info kelas untuk payload sinkronisasi
    const [kelasInfo] = await conn.query('SELECT kode, nama FROM kelas WHERE id = ?', [kelasId]);
    const kelas = kelasInfo[0];

    // Langkah 3: Siapkan payload dan panggil sinkron transkrip melalui gateway
    const entries = nilaiRows.map(n => ({
      nim: n.nim,
      nilai_angka: parseFloat(n.nilai_angka),
      nilai_huruf: convertToGrade(parseFloat(n.nilai_angka)),
    }));

    const payload = {
      kelas_id: parseInt(kelasId),
      kode_mk: kelas.kode,
      nama_mk: kelas.nama,
      entries,
    };

    try {
      // Langkah 3-5: Panggil POST /transkrip/sinkron melalui gateway
      await syncTranskrip(payload);
    } catch (syncErr) {
      // Langkah 6 (gagal): ROLLBACK — status final dibatalkan
      console.error('[Finalisasi] Sinkron transkrip gagal:', syncErr.message);
      await conn.rollback();
      conn.release();
      return res.status(502).json({
        error: 'Sinkronisasi transkrip gagal. Semua perubahan dibatalkan (rollback).',
        detail: syncErr.message,
      });
    }

    // Langkah 6 (sukses): COMMIT
    await conn.commit();
    conn.release();

    res.json({
      message: 'Finalisasi berhasil. Nilai sudah final dan transkrip tersinkronisasi.',
      finalized_count: nilaiRows.length,
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('[Finalisasi] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

