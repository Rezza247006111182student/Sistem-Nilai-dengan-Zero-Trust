/**
 * service-nilai/server.js — Service Nilai — Port 3001
 * Endpoint: GET /nilai, PUT /nilai/:id, POST /kelas/:id/finalisasi
 * Semua request wajib melewati gateway (X-Gateway-Secret + JWT valid).
 */

require('dotenv').config();
const express = require('express');
const verifyGatewaySecret = require('./middleware/gatewaySecret');
const verifyToken = require('./middleware/verifyToken');
const nilaiRoutes = require('./routes/nilai');
const kelasRoutes = require('./routes/kelas');

const app = express();
const port = parseInt(process.env.NILAI_PORT || '3001');

// Kebutuhan 4.1: Semua request wajib gateway secret DAN token valid
app.use(verifyGatewaySecret);
app.use(verifyToken);

// Route
app.use('/nilai', nilaiRoutes);
app.use('/kelas', kelasRoutes);

// Catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

app.listen(port, () => {
  console.log(`[Service Nilai] berjalan di port ${port}`);
});

module.exports = app;

