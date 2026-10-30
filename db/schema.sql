-- Skema database Sistem Nilai Zero Trust
-- Engine InnoDB wajib untuk transaksi dan foreign key

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS transkrip;
DROP TABLE IF EXISTS nilai;
DROP TABLE IF EXISTS kelas;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS service_clients;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('mahasiswa','dosen','admin') NOT NULL,
  nama VARCHAR(100) NOT NULL,
  nim VARCHAR(20) NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  label VARCHAR(100),
  UNIQUE(user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kelas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(20) NOT NULL,
  nama VARCHAR(100) NOT NULL,
  dosen_id INT NOT NULL,
  FOREIGN KEY (dosen_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE nilai (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas_id INT NOT NULL,
  mahasiswa_id INT NOT NULL,
  nilai_angka DECIMAL(5,2) NULL,
  status ENUM('draft','final') DEFAULT 'draft',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(kelas_id, mahasiswa_id),
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
  FOREIGN KEY (mahasiswa_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE transkrip (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nim VARCHAR(20) NOT NULL,
  kelas_id INT NOT NULL,
  kode_mk VARCHAR(20) NOT NULL,
  nama_mk VARCHAR(100) NOT NULL,
  nilai_angka DECIMAL(5,2),
  nilai_huruf VARCHAR(2),
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(nim, kelas_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  device_id VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE service_clients (
  client_id VARCHAR(50) PRIMARY KEY,
  secret_hash VARCHAR(255) NOT NULL,
  nama VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  waktu DATETIME(3) NOT NULL,
  subject_type ENUM('user','service','anonymous') NOT NULL,
  subject_id VARCHAR(64) NULL,
  endpoint VARCHAR(255) NOT NULL,
  device_id VARCHAR(64) NULL,
  hasil ENUM('allow','deny') NOT NULL,
  alasan VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

