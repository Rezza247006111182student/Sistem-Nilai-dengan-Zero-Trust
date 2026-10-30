/**
 * service-transkrip/server.js — Service Transkrip — Port 3002
 * Endpoint: GET /transkrip/:nim, POST /transkrip/sinkron
 * Semua request wajib melewati gateway (X-Gateway-Secret + JWT valid).
 */

require('dotenv').config();
const express = require('express');
const verifyGatewaySecret = require('./middleware/gatewaySecret');
const verifyToken = require('./middleware/verifyToken');
const transkripRoutes = require('./routes/transkrip');

const app = express();
const port = parseInt(process.env.TRANSKRIP_PORT || '3002');

// Kebutuhan 4.1: Semua request wajib gateway secret DAN token valid
app.use(verifyGatewaySecret);
app.use(verifyToken);

// Route
app.use('/transkrip', transkripRoutes);

// Catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

app.listen(port, () => {
  console.log(`[Service Transkrip] berjalan di port ${port}`);
});

module.exports = app;

