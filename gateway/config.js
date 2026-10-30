/**
 * gateway/config.js — Konfigurasi gateway dari environment variables
 * Semua konfigurasi hanya dari .env, tidak ada hardcode.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const config = {
  port: parseInt(process.env.GATEWAY_PORT || '3000'),
  nilaiUrl: process.env.NILAI_URL || 'http://127.0.0.1:3001',
  transkripUrl: process.env.TRANSKRIP_URL || 'http://127.0.0.1:3002',
  gatewaySecret: process.env.GATEWAY_SECRET || 'ganti-dengan-string-acak-panjang',

  // JWT keys — private key hanya di gateway, service hanya public key
  privateKey: fs.readFileSync(path.resolve(process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem'), 'utf8'),
  publicKey: fs.readFileSync(path.resolve(process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem'), 'utf8'),

  accessTokenTTL: process.env.ACCESS_TOKEN_TTL || '10m',
  serviceTokenTTL: process.env.SERVICE_TOKEN_TTL || '5m',
  refreshTokenTTLDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '1'),

  // Kebutuhan 4.3: jam akses dapat dikonfigurasi
  accessHourStart: parseInt(process.env.ACCESS_HOUR_START || '7'),
  accessHourEnd: parseInt(process.env.ACCESS_HOUR_END || '21'),
  accessTimezone: process.env.ACCESS_TIMEZONE || 'Asia/Jakarta',

  serviceClientId: process.env.SERVICE_CLIENT_ID || 'service-nilai',
};

module.exports = config;

