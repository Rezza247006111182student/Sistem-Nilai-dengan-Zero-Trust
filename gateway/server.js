/**
 * gateway/server.js — API Gateway (PEP) — Port 3000
 * Satu-satunya pintu masuk ke sistem. Routing:
 * - /auth/* ditangani gateway sendiri
 * - /nilai/* dan /kelas/* diteruskan ke Service Nilai (3001)
 * - /transkrip/* diteruskan ke Service Transkrip (3002)
 */

require('dotenv').config();
const express = require('express');
const config = require('./config');
const authRoutes = require('./auth/authRoutes');
const verifyToken = require('./middleware/verifyToken');
const deviceCheck = require('./middleware/deviceCheck');
const enforce = require('./middleware/enforce');
const { nilaiProxy, transkripProxy } = require('./proxy');

const app = express();

// /auth/* — ditangani gateway, body JSON diparse di authRoutes
app.use('/auth', authRoutes);

// Untuk route yang di-proxy: JANGAN parse body JSON di sini agar tidak merusak stream
// Tapi kita perlu parse body untuk POST /transkrip/sinkron yang dikirim oleh service-nilai
// Solusi: parse JSON hanya untuk endpoint tertentu yang membutuhkannya
app.use('/transkrip/sinkron', express.json());
app.use('/kelas', express.json());

// Semua route selain /auth/* melewati pipeline zero trust:
// verifyToken → deviceCheck → enforce (policy + audit) → proxy
app.use('/nilai', verifyToken, deviceCheck, enforce, nilaiProxy);
app.use('/kelas', verifyToken, deviceCheck, enforce, nilaiProxy);
app.use('/transkrip', verifyToken, deviceCheck, enforce, transkripProxy);

// Catch-all: deny by default untuk endpoint yang tidak dikenali
app.use(async (req, res) => {
  const { logAudit } = require('./audit');
  const endpoint = `${req.method} ${req.path}`;
  const deviceId = req.headers['x-device-id'] || null;
  await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: 'unknown_endpoint' });
  res.status(403).json({ error: 'unknown_endpoint' });
});

app.listen(config.port, () => {
  console.log(`[Gateway] PEP berjalan di port ${config.port}`);
});

module.exports = app;

