/**
 * gateway/auth/authRoutes.js — Kebutuhan 4.1: Endpoint autentikasi
 * POST /auth/login    — Login dengan username, password, X-Device-ID
 * POST /auth/refresh  — Refresh token (rotasi)
 * POST /auth/logout   — Logout (cabut refresh token)
 * POST /auth/service  — Token service untuk komunikasi antar-service
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../shared/db');
const { signAccessToken, generateRefreshToken, saveRefreshToken, rotateRefreshToken, revokeRefreshToken, signServiceToken } = require('./tokens');
const { logAudit } = require('../audit');

const router = express.Router();

// Body JSON hanya diparse di route yang membutuhkannya (/auth/*)
router.use(express.json());

// POST /auth/login — Kebutuhan 4.1: Login, terbit access + refresh token
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const deviceId = req.headers['x-device-id'];
  const endpoint = 'POST /auth/login';

  if (!username || !password) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: 'invalid_credentials' });
    return res.status(401).json({ error: 'Kredensial tidak valid.' });
  }

  // Cari user di database
  const [users] = await pool.query('SELECT id, username, password_hash, role FROM users WHERE username = ?', [username]);
  if (users.length === 0) {
    await logAudit({ subjectType: 'anonymous', subjectId: username, endpoint, deviceId, hasil: 'deny', alasan: 'invalid_credentials' });
    return res.status(401).json({ error: 'Kredensial tidak valid.' });
  }

  const user = users[0];

  // Verifikasi password dengan bcryptjs
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await logAudit({ subjectType: 'user', subjectId: String(user.id), endpoint, deviceId, hasil: 'deny', alasan: 'invalid_credentials' });
    return res.status(401).json({ error: 'Kredensial tidak valid.' });
  }

  // Kebutuhan 4.3: Verifikasi device terdaftar untuk user ini
  if (!deviceId) {
    await logAudit({ subjectType: 'user', subjectId: String(user.id), endpoint, deviceId, hasil: 'deny', alasan: 'device_not_registered' });
    return res.status(403).json({ error: 'Device tidak terdaftar.' });
  }

  const [devices] = await pool.query(
    'SELECT id FROM devices WHERE user_id = ? AND device_id = ?',
    [user.id, deviceId]
  );
  if (devices.length === 0) {
    await logAudit({ subjectType: 'user', subjectId: String(user.id), endpoint, deviceId, hasil: 'deny', alasan: 'device_not_registered' });
    return res.status(403).json({ error: 'Device tidak terdaftar.' });
  }

  // Terbitkan token
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = generateRefreshToken();
  await saveRefreshToken(user.id, refreshToken, deviceId);

  await logAudit({ subjectType: 'user', subjectId: String(user.id), endpoint, deviceId, hasil: 'allow', alasan: 'login_success' });

  res.json({ access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer' });
});

// POST /auth/refresh — Kebutuhan 4.1: Refresh token (rotasi)
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  const deviceId = req.headers['x-device-id'];
  const endpoint = 'POST /auth/refresh';

  if (!refresh_token) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: 'refresh_token_invalid' });
    return res.status(401).json({ error: 'Refresh token tidak valid.' });
  }

  // Kebutuhan 4.3: X-Device-ID wajib untuk setiap request user
  if (!deviceId) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: 'device_not_registered' });
    return res.status(403).json({ error: 'Device tidak terdaftar.' });
  }

  const result = await rotateRefreshToken(refresh_token, deviceId);
  if (result.error) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: result.error });
    const status = result.error === 'refresh_token_revoked' ? 401 : 401;
    return res.status(status).json({ error: 'Refresh token tidak valid.' });
  }

  await logAudit({ subjectType: 'user', subjectId: String(result.userId), endpoint, deviceId, hasil: 'allow', alasan: 'refresh_success' });
  res.json({ access_token: result.accessToken, refresh_token: result.refreshToken, token_type: 'Bearer' });
});

// POST /auth/logout — Kebutuhan 4.1: Logout (cabut refresh token)
router.post('/logout', async (req, res) => {
  const { refresh_token } = req.body || {};
  const deviceId = req.headers['x-device-id'];
  const endpoint = 'POST /auth/logout';

  if (!refresh_token) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: 'refresh_token_invalid' });
    return res.status(401).json({ error: 'Refresh token tidak valid.' });
  }

  // Kebutuhan 4.3: X-Device-ID wajib
  if (!deviceId) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: 'device_not_registered' });
    return res.status(403).json({ error: 'Device tidak terdaftar.' });
  }

  const result = await revokeRefreshToken(refresh_token);
  if (result.error) {
    await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'deny', alasan: result.error });
    return res.status(401).json({ error: 'Refresh token tidak valid.' });
  }

  await logAudit({ subjectType: 'anonymous', subjectId: null, endpoint, deviceId, hasil: 'allow', alasan: 'logout_success' });
  res.json({ message: 'Logout berhasil.' });
});

// POST /auth/service — Kebutuhan 4.1: Token service untuk komunikasi antar-service
router.post('/service', async (req, res) => {
  const { client_id, client_secret } = req.body || {};
  const endpoint = 'POST /auth/service';

  if (!client_id || !client_secret) {
    await logAudit({ subjectType: 'service', subjectId: client_id || null, endpoint, deviceId: null, hasil: 'deny', alasan: 'invalid_service_credentials' });
    return res.status(401).json({ error: 'Kredensial service tidak valid.' });
  }

  const [clients] = await pool.query('SELECT client_id, secret_hash FROM service_clients WHERE client_id = ?', [client_id]);
  if (clients.length === 0) {
    await logAudit({ subjectType: 'service', subjectId: client_id, endpoint, deviceId: null, hasil: 'deny', alasan: 'invalid_service_credentials' });
    return res.status(401).json({ error: 'Kredensial service tidak valid.' });
  }

  const valid = await bcrypt.compare(client_secret, clients[0].secret_hash);
  if (!valid) {
    await logAudit({ subjectType: 'service', subjectId: client_id, endpoint, deviceId: null, hasil: 'deny', alasan: 'invalid_service_credentials' });
    return res.status(401).json({ error: 'Kredensial service tidak valid.' });
  }

  const token = signServiceToken(client_id);
  await logAudit({ subjectType: 'service', subjectId: client_id, endpoint, deviceId: null, hasil: 'allow', alasan: 'service_token_issued' });

  res.json({ access_token: token, token_type: 'Bearer' });
});

module.exports = router;

