/**
 * service-nilai/serviceClient.js — Kebutuhan 4.1: Token service untuk komunikasi antar-service
 * Service Nilai mengambil dan meng-cache token service dari gateway (POST /auth/service).
 * Digunakan saat finalisasi untuk memanggil POST /transkrip/sinkron melalui gateway.
 */

let cachedToken = null;
let cachedExpiry = 0;

/**
 * Ambil token service dari gateway, cache sampai mendekati kedaluwarsa.
 * @returns {Promise<string>} access token
 */
async function getServiceToken() {
  // Cache masih berlaku (dengan margin 30 detik)
  if (cachedToken && Date.now() < cachedExpiry - 30000) {
    return cachedToken;
  }

  const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';
  const response = await fetch(`${gatewayUrl}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SERVICE_CLIENT_ID || 'service-nilai',
      client_secret: process.env.SERVICE_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil token service: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;

  // Parse expiry dari JWT (tanpa verifikasi, hanya untuk cache timing)
  const payload = JSON.parse(Buffer.from(cachedToken.split('.')[1], 'base64').toString());
  cachedExpiry = payload.exp * 1000;

  return cachedToken;
}

/**
 * Panggil POST /transkrip/sinkron melalui gateway dengan token service.
 * Timeout 5 detik sesuai SPEC.md.
 * @param {object} payload - { kelas_id, kode_mk, nama_mk, entries }
 * @returns {Promise<object>} response data
 */
async function syncTranskrip(payload) {
  const token = await getServiceToken();
  const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${gatewayUrl}/transkrip/sinkron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Sinkron gagal: ${response.status} - ${errBody}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getServiceToken, syncTranskrip };

