/**
 * shared/db.js — Pool koneksi MySQL bersama
 * Setiap proses (gateway, service-nilai, service-transkrip) membuat pool sendiri
 * ke database yang sama (sistem_nilai).
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sistem_nilai',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;

