/**
 * gateway/auth/tokens.js — Kebutuhan 4.1: Penerbitan dan pengelolaan token
 * - Access token JWT RS256 (sub, role, iat, exp, iss, jti)
 * - Service token JWT RS256 (sub=client_id, role=service)
 * - Refresh token: random 64 byte, disimpan sebagai hash SHA-256, dirotasi, terikat device
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const pool = require('../../shared/db');

// Kebutuhan 4.1: Access token JWT RS256, hanya berisi sub dan role
function signAccessToken(userId, role) {
  return jwt.sign(
    { sub: String(userId), role },
    config.privateKey,
    {
      algorithm: 'RS256',
      expiresIn: config.accessTokenTTL,
      issuer: 'sistem-nilai-gateway',
      jwtid: crypto.randomUUID(),
    }
  );
}

// Kebutuhan 4.1: Service token untuk komunikasi antar-service
function signServiceToken(clientId) {
  return jwt.sign(
    { sub: clientId, role: 'service' },
    config.privateKey,
    {
      algorithm: 'RS256',
      expiresIn: config.serviceTokenTTL,
      issuer: 'sistem-nilai-gateway',
      jwtid: crypto.randomUUID(),
    }
  );
}

// Verifikasi JWT dengan public key (bisa juga private key di gateway)
function verifyToken(token) {
  return jwt.verify(token, config.publicKey, { algorithms: ['RS256'], issuer: 'sistem-nilai-gateway' });
}

// Kebutuhan 4.1: Refresh token — random 64 byte, simpan hash SHA-256, terikat device
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Simpan refresh token ke database
async function saveRefreshToken(userId, refreshToken, deviceId) {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + config.refreshTokenTTLDays * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at) VALUES (?, ?, ?, ?)`,
    [userId, tokenHash, deviceId, expiresAt]
  );
}

// Kebutuhan 4.1: Rotasi refresh token — invalidasi yang lama, terbitkan yang baru
async function rotateRefreshToken(oldRefreshToken, deviceId) {
  const oldHash = hashToken(oldRefreshToken);

  const [rows] = await pool.query(
    `SELECT id, user_id, device_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?`,
    [oldHash]
  );
  if (rows.length === 0) return { error: 'refresh_token_invalid' };

  const rt = rows[0];
  if (rt.revoked_at) return { error: 'refresh_token_revoked' };
  if (new Date(rt.expires_at) < new Date()) return { error: 'refresh_token_expired' };
  if (rt.device_id !== deviceId) return { error: 'refresh_token_invalid' };

  // Cabut token lama
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [rt.id]);

  // Terbitkan token baru
  const newRefreshToken = generateRefreshToken();
  await saveRefreshToken(rt.user_id, newRefreshToken, deviceId);

  // Terbitkan access token baru
  const [userRows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [rt.user_id]);
  const user = userRows[0];
  const accessToken = signAccessToken(user.id, user.role);

  return { accessToken, refreshToken: newRefreshToken, userId: user.id };
}

// Cabut refresh token (untuk logout)
async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  const [rows] = await pool.query(
    `SELECT id, revoked_at FROM refresh_tokens WHERE token_hash = ?`,
    [tokenHash]
  );
  if (rows.length === 0) return { error: 'refresh_token_invalid' };
  if (rows[0].revoked_at) return { error: 'refresh_token_revoked' };

  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [rows[0].id]);
  return { success: true };
}

module.exports = {
  signAccessToken,
  signServiceToken,
  verifyToken,
  generateRefreshToken,
  hashToken,
  saveRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
};

