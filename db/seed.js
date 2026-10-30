/**
 * db/seed.js — Seed database Sistem Nilai Zero Trust
 * Idempotent: membuat database bila belum ada, drop & recreate tabel, isi data seed.
 * Jalankan: npm run seed
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function seed() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306');
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'sistem_nilai';

  // Koneksi tanpa database untuk membuat database
  const connNoDB = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  await connNoDB.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await connNoDB.end();

  // Koneksi ke database yang sudah dibuat
  const conn = await mysql.createConnection({ host, port, user, password, database: dbName, multipleStatements: true });

  // Jalankan schema.sql
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('✔ Schema berhasil dijalankan');

  // Hash password demo
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Insert users
  const users = [
    ['admin1', passwordHash, 'admin', 'Administrator', null],
    ['dosen1', passwordHash, 'dosen', 'Dosen Satu', null],
    ['dosen2', passwordHash, 'dosen', 'Dosen Dua', null],
    ['mhs1', passwordHash, 'mahasiswa', 'Mahasiswa Satu', '2210001'],
    ['mhs2', passwordHash, 'mahasiswa', 'Mahasiswa Dua', '2210002'],
    ['mhs3', passwordHash, 'mahasiswa', 'Mahasiswa Tiga', '2210003'],
  ];
  for (const u of users) {
    await conn.query('INSERT INTO users (username, password_hash, role, nama, nim) VALUES (?, ?, ?, ?, ?)', u);
  }
  console.log('✔ Users berhasil di-seed');

  // Ambil ID users
  const [rows] = await conn.query('SELECT id, username FROM users');
  const userMap = {};
  for (const r of rows) userMap[r.username] = r.id;

  // Insert devices — setiap user punya 1 device terdaftar
  const devices = [
    [userMap.admin1, 'DEV-ADMIN-01', 'Laptop Admin'],
    [userMap.dosen1, 'DEV-DOSEN-01', 'Laptop Dosen 1'],
    [userMap.dosen2, 'DEV-DOSEN-02', 'Laptop Dosen 2'],
    [userMap.mhs1, 'DEV-MHS-01', 'Laptop Mhs 1'],
    [userMap.mhs2, 'DEV-MHS-02', 'Laptop Mhs 2'],
    [userMap.mhs3, 'DEV-MHS-03', 'Laptop Mhs 3'],
  ];
  for (const d of devices) {
    await conn.query('INSERT INTO devices (user_id, device_id, label) VALUES (?, ?, ?)', d);
  }
  console.log('✔ Devices berhasil di-seed');

  // Insert kelas: KI-A diampu dosen1, KI-B diampu dosen2
  await conn.query('INSERT INTO kelas (kode, nama, dosen_id) VALUES (?, ?, ?)', ['KI-A', 'Keamanan Informasi A', userMap.dosen1]);
  await conn.query('INSERT INTO kelas (kode, nama, dosen_id) VALUES (?, ?, ?)', ['KI-B', 'Keamanan Informasi B', userMap.dosen2]);
  console.log('✔ Kelas berhasil di-seed');

  // Ambil ID kelas
  const [kelasRows] = await conn.query('SELECT id, kode FROM kelas');
  const kelasMap = {};
  for (const k of kelasRows) kelasMap[k.kode] = k.id;

  // Insert nilai — enrollment dengan nilai awal terisi, status draft
  // mhs1 dan mhs2 di KI-A, mhs2 dan mhs3 di KI-B
  const nilaiData = [
    [kelasMap['KI-A'], userMap.mhs1, 85.00],
    [kelasMap['KI-A'], userMap.mhs2, 72.50],
    [kelasMap['KI-B'], userMap.mhs2, 68.00],
    [kelasMap['KI-B'], userMap.mhs3, 90.00],
  ];
  for (const n of nilaiData) {
    await conn.query('INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka) VALUES (?, ?, ?)', n);
  }
  console.log('✔ Nilai berhasil di-seed');

  // Insert service client
  const serviceSecret = process.env.SERVICE_CLIENT_SECRET || 'ganti-dengan-secret-service';
  const secretHash = await bcrypt.hash(serviceSecret, 10);
  await conn.query('INSERT INTO service_clients (client_id, secret_hash, nama) VALUES (?, ?, ?)',
    [process.env.SERVICE_CLIENT_ID || 'service-nilai', secretHash, 'Service Nilai']);
  console.log('✔ Service client berhasil di-seed');

  await conn.end();
  console.log('\n✅ Seed selesai. Database sistem_nilai siap digunakan.');
}

seed().catch(err => {
  console.error('❌ Seed gagal:', err.message);
  process.exit(1);
});

