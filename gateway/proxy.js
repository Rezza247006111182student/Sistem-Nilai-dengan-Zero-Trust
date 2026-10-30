/**
 * gateway/proxy.js — Kebutuhan 4.1: Proxy request ke service
 * - Menghapus header X-Gateway-Secret dari client (jangan percaya kiriman client)
 * - Menambahkan X-Gateway-Secret milik gateway
 * - Meneruskan Authorization header
 */

const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const config = require('./config');

function createServiceProxy(targetUrl) {
  return createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    // Saat proxy di-mount (app.use('/nilai', ...)), Express memotong prefix dari req.url.
    // Kembalikan path lengkap agar service menerima /nilai, /kelas, /transkrip/... dengan benar.
    pathRewrite: (path, req) => req.originalUrl || path,
    // Gunakan fixRequestBody bila body sudah diparse
    on: {
      proxyReq: (proxyReq, req) => {
        // Kebutuhan 4.1: Hapus header palsu dari client, tambah yang asli
        proxyReq.setHeader('X-Gateway-Secret', config.gatewaySecret);

        // fixRequestBody untuk request yang body-nya sudah diparse
        if (req.body && req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
          fixRequestBody(proxyReq, req);
        }
      },
      error: (err, req, res) => {
        console.error('[PROXY ERROR]', err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Service tidak dapat dihubungi.' });
        }
      },
    },
  });
}

const nilaiProxy = createServiceProxy(config.nilaiUrl);
const transkripProxy = createServiceProxy(config.transkripUrl);

module.exports = { nilaiProxy, transkripProxy };

