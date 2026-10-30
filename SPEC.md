# SPEC — Sistem Nilai Zero Trust (Tugas Praktikum Individu, Keamanan Informasi)

Dokumen ini adalah acuan tunggal untuk membangun proyek. Semua keputusan di sini sudah diselaraskan dengan dokumen tugas (bagian 1–6). Jika ada ambiguitas, ikuti dokumen ini dan catat asumsinya di README bagian "Asumsi".

---

## 1. Tujuan

- Menerapkan prinsip zero trust (never trust, always verify; least privilege; assume breach) di level aplikasi.
- API Gateway berperan sebagai **Policy Enforcement Point (PEP)** yang terpisah dari service, mengacu pada NIST SP 800-207.
- Penilaian berfokus pada **mekanisme kontrol akses**, bukan tampilan. Tidak perlu frontend.

## 2. Keputusan Teknis

| # | Topik | Keputusan | Catatan |
|---|-------|-----------|---------|
| 1 | Runtime | Node.js 18+ (wajib, karena memakai `fetch` bawaan) | |
| 2 | Framework | Express untuk gateway, Service Nilai, Service Transkrip (3 aplikasi terpisah) | |
| 3 | Proxy | `http-proxy-middleware` (gunakan `fixRequestBody` bila body sudah diparse) | |
| 4 | Database | **MySQL dari XAMPP**, satu database bersama bernama `sistem_nilai`, driver `mysql2/promise` (pool) | Sesuai Bagian 5: "MySQL/MariaDB melalui Laragon/XAMPP" |
| 5 | JWT | `jsonwebtoken`, algoritma **RS256** (gateway memegang private key, service hanya memegang public key) | Wajib set `algorithms: ['RS256']` saat verify |
| 6 | Hash password | `bcryptjs` (pure JS, aman dipasang di Windows tanpa build tool) | |
| 7 | Refresh token | String acak 64 byte, disimpan **sebagai hash SHA-256** di DB, **dirotasi** setiap dipakai, terikat `device_id` | Berlaku 1 hari, dapat dicabut |
| 8 | Audit log | **Tabel `audit_log`** di MySQL, ditulis oleh gateway | Mudah ditampilkan saat demo |
| 9 | Jam akses | Default 07.00–21.00 zona **Asia/Jakarta (WIB)**, diatur lewat `.env` | Rentang valid: jam >= mulai dan jam < selesai |
| 10 | Kegagalan sinkronisasi | **Rollback**: status final dibatalkan bila pemanggilan sinkron transkrip gagal | Pakai transaksi MySQL |
| 11 | Cara menjalankan | Langsung (tanpa Docker), satu perintah `npm start` menjalankan 3 proses | Docker Compose tidak diperlukan |
| 12 | Hak admin | Admin hanya `GET /transkrip/:nim`. Admin **ditolak** di `/nilai` dan `/kelas` | Sesuai Tabel 3 |

### Penyesuaian karena memakai MySQL (XAMPP)

- Default XAMPP: host `127.0.0.1`, port `3306`, user `root`, password kosong. Semua dibaca dari `.env`.
- Pastikan modul MySQL di XAMPP Control Panel berstatus **Running** sebelum menjalankan seed.
- Skrip `db/seed.js` harus: membuat database bila belum ada (`CREATE DATABASE IF NOT EXISTS sistem_nilai CHARACTER SET utf8mb4`), menjalankan `db/schema.sql`, lalu mengisi data seed. Skrip harus **idempotent** (aman dijalankan berulang, misalnya dengan `DROP TABLE IF EXISTS` di awal atau opsi `--reset`).
- Gunakan engine InnoDB (wajib untuk transaksi dan foreign key).
- Semua query memakai **prepared statement / parameter binding** (`?`), tanpa string concatenation.
- Kedua service dan gateway membuat pool koneksi sendiri ke database yang sama (kode koneksi boleh dibagi di `shared/db.js`).

## 3. Arsitektur

```
Client (Postman/curl)
   |  Authorization: Bearer <access token>, X-Device-ID
   v
API Gateway (PEP) :3000  --- Policy Engine/Policy Administrator (modul di dalam gateway)
   |        \--> Audit Log (tabel audit_log)
   |  allow + X-Gateway-Secret + Authorization diteruskan
   +--> Service Nilai     :3001  --(finalisasi)--> panggil gateway: POST /transkrip/sinkron (token service)
   +--> Service Transkrip :3002
Database MySQL bersama (sistem_nilai)
```

Routing gateway: `/auth/*` ditangani gateway sendiri, `/nilai/*` dan `/kelas/*` diteruskan ke 3001, `/transkrip/*` diteruskan ke 3002.

### Alur satu request user (selain /auth/*)

1. Gateway memeriksa header `Authorization`. Tidak ada atau JWT tidak valid/kedaluwarsa: **401** + audit deny.
2. Gateway memeriksa `X-Device-ID` terdaftar untuk `sub` di tabel `devices`. Gagal: **403** + audit deny.
3. Policy Engine (`policy.js`) memutuskan allow/deny berdasarkan Tabel 3 dan atribut dari DB. Deny: **403** + audit deny dengan alasan.
4. Allow: gateway mencatat audit allow, **menghapus** header `X-Gateway-Secret` dari request client (jangan percaya kiriman client), lalu menambahkan `X-Gateway-Secret` miliknya dan meneruskan request beserta header `Authorization` ke service.
5. Service memverifikasi ulang: (a) `X-Gateway-Secret` (bandingkan dengan `crypto.timingSafeEqual`), (b) tanda tangan + masa berlaku JWT. Gagal salah satu: 401/403. Token valid tanpa gateway secret **ditolak**, gateway secret tanpa token valid **juga ditolak**.

### Alur request service (Service Nilai ke gateway)

Tanpa `X-Device-ID`. Gateway memverifikasi token service, Policy Engine hanya mengizinkan `role: service` untuk `POST /transkrip/sinkron`, audit dicatat dengan `subject_type = service`.

## 4. Matriks Kebijakan (Tabel 3) dan Alasan Deny

| Endpoint | Ditangani | Diizinkan | Kondisi allow | Contoh alasan deny (isi kolom `alasan`) |
|----------|-----------|-----------|---------------|----------------------------------------|
| `POST /auth/login` | Gateway | Semua user | Kredensial valid **dan** `X-Device-ID` terdaftar untuk user itu | `invalid_credentials`, `device_not_registered` |
| `POST /auth/refresh` | Gateway | Semua user | Refresh token valid, belum dicabut, belum kedaluwarsa, cocok dengan device | `refresh_token_invalid`, `refresh_token_revoked`, `refresh_token_expired` |
| `POST /auth/logout` | Gateway | Semua user | Refresh token valid, lalu dicabut | sama seperti di atas |
| `POST /auth/service` | Gateway | Service Nilai | `client_id` + `client_secret` valid (tabel `service_clients`, secret di-hash) | `invalid_service_credentials` |
| `GET /nilai` | Nilai | Mahasiswa, dosen | Mahasiswa: hanya nilai miliknya. Dosen: wajib `?kelas_id=`, kelas harus diampu | `role_not_allowed`, `not_own_grade`, `class_not_taught`, `kelas_id_required` |
| `PUT /nilai/:id` | Nilai | Dosen | Nilai milik kelas yang diampu, `status = draft`, dalam jam akses | `role_not_allowed`, `class_not_taught`, `grade_already_final`, `outside_access_hours`, `grade_not_found` |
| `POST /kelas/:id/finalisasi` | Nilai | Dosen | Kelas diampu, dalam jam akses. Setelah itu Service Nilai memanggil sinkron transkrip | `role_not_allowed`, `class_not_taught`, `outside_access_hours` |
| `GET /transkrip/:nim` | Transkrip | Mahasiswa, admin | Mahasiswa: hanya NIM sendiri (NIM dibaca dari DB, **bukan dari token**). Admin: semua NIM | `role_not_allowed`, `not_own_nim` |
| `POST /transkrip/sinkron` | Transkrip | Service Nilai | **Hanya** token `role: service`. Token user mana pun ditolak | `service_token_required` |

Aturan umum:
- Selain `/auth/*`, setiap request user wajib access token valid dan device terdaftar.
- Endpoint/method yang tidak ada di tabel: **deny by default** (`unknown_endpoint`).
- Kebijakan kepemilikan **tidak boleh** diputuskan dari isi token. Token hanya berisi `sub` dan `role` (boleh ditambah `iat`, `exp`, `iss`, `jti`). Jangan menaruh NIM atau daftar kelas di token.
- `X-Device-ID` juga diwajibkan di `/auth/refresh` dan `/auth/logout` (asumsi: bagian 4.3 menyatakan "setiap request dari user"), dan refresh token terikat ke device.
- Pesan error ke client untuk login dibuat generik. Alasan rinci hanya masuk audit log.
- Kode HTTP: 400 body/parameter salah, 401 token/kredensial salah atau tidak ada, 403 ditolak kebijakan, 404 resource tidak ada (setelah lolos kebijakan), 502 service tidak dapat dihubungi.

## 5. Skema Database (`db/schema.sql`)

```sql
users(id PK AI, username UNIQUE, password_hash, role ENUM('mahasiswa','dosen','admin'),
      nama, nim NULL UNIQUE)               -- nim hanya terisi untuk mahasiswa
devices(id PK AI, user_id FK users, device_id VARCHAR(64), label,
        UNIQUE(user_id, device_id))
kelas(id PK AI, kode, nama, dosen_id FK users)
nilai(id PK AI, kelas_id FK, mahasiswa_id FK users, nilai_angka DECIMAL(5,2) NULL,
      status ENUM('draft','final') DEFAULT 'draft', updated_at,
      UNIQUE(kelas_id, mahasiswa_id))
transkrip(id PK AI, nim, kelas_id, kode_mk, nama_mk, nilai_angka DECIMAL(5,2),
          nilai_huruf VARCHAR(2), synced_at, UNIQUE(nim, kelas_id))
refresh_tokens(id PK AI, user_id FK, token_hash CHAR(64) UNIQUE, device_id,
               expires_at DATETIME, revoked_at DATETIME NULL, created_at)
service_clients(client_id PK, secret_hash, nama)
audit_log(id PK AI, waktu DATETIME(3), subject_type ENUM('user','service','anonymous'),
          subject_id VARCHAR(64) NULL, endpoint VARCHAR(255) /* "METHOD /path" */,
          device_id VARCHAR(64) NULL, hasil ENUM('allow','deny'), alasan VARCHAR(255))
```

## 6. Data Seed (`db/seed.js`)

Minimal sesuai tugas: 1 admin, 2 dosen, 3 mahasiswa, 2 kelas yang diampu dosen berbeda, **setiap user punya 1 device terdaftar**.

| Username | Role | NIM | Device ID |
|----------|------|-----|-----------|
| admin1 | admin | - | DEV-ADMIN-01 |
| dosen1 | dosen | - | DEV-DOSEN-01 |
| dosen2 | dosen | - | DEV-DOSEN-02 |
| mhs1 | mahasiswa | 2210001 | DEV-MHS-01 |
| mhs2 | mahasiswa | 2210002 | DEV-MHS-02 |
| mhs3 | mahasiswa | 2210003 | DEV-MHS-03 |

Password demo semua akun: `Password123!` (hanya untuk demo, disimpan sebagai hash bcrypt).
Kelas: `KI-A` diampu `dosen1`, `KI-B` diampu `dosen2`. Enrollment (baris `nilai` berstatus draft dengan nilai awal terisi): `mhs1` dan `mhs2` di KI-A, `mhs2` dan `mhs3` di KI-B.
Service client: `client_id = service-nilai`, secret dari `.env` (di-hash di DB). Untuk uji device tidak terdaftar, cukup kirim `X-Device-ID` acak (misalnya `DEV-UNKNOWN`) yang tidak ada di seed.

## 7. Struktur Folder dan Peta Kebutuhan ke Kode (untuk video demo)

```
sistem-nilai/
  package.json            (scripts: genkeys, seed, start, test)
  .env.example  .gitignore  README.md  SPEC.md
  keys/                   (private.pem, public.pem — tidak di-commit)
  db/ schema.sql  seed.js
  shared/ db.js
  gateway/
    server.js                      routing + urutan middleware
    auth/ authRoutes.js            login, refresh, logout, /auth/service
    auth/ tokens.js                terbit JWT user dan service (RS256), refresh token (hash, rotasi, cabut)
    middleware/ verifyToken.js     verifikasi JWT di gateway
    middleware/ deviceCheck.js     4.3 device terdaftar
    policy.js                      Policy Engine: decide() -> {allow, reason}
    middleware/ enforce.js         PEP: panggil policy, audit, proxy
    audit.js                       4.4 tulis audit_log
    proxy.js                       tambah X-Gateway-Secret, hapus header palsu dari client
    config.js                      jam akses, secret, port
  service-nilai/
    server.js  routes/nilai.js  routes/kelas.js
    middleware/ gatewaySecret.js   4.1 gateway secret
    middleware/ verifyToken.js     4.1 verifikasi ulang JWT (public key)
    serviceClient.js               ambil + cache token service, panggil gateway untuk sinkron
  service-transkrip/
    server.js  routes/transkrip.js
    middleware/ gatewaySecret.js  middleware/ verifyToken.js
  tests/ run-scenarios.js
  postman/ sistem-nilai.postman_collection.json
```

Tabel pemetaan di README wajib berisi: kebutuhan (4.1 s.d. 4.4) dan nama file + fungsi yang menanganinya, agar mudah ditunjuk saat video. Setiap file diberi komentar singkat berbahasa Indonesia yang menyebut bagian kebutuhan yang dipenuhi (contoh: `// Kebutuhan 4.3: verifikasi device terdaftar`).

## 8. Alur Finalisasi (`POST /kelas/:id/finalisasi`)

1. Gateway: JWT valid, device valid, Policy Engine memeriksa role dosen, `kelas.dosen_id = sub`, dalam jam akses. Allow lalu diteruskan.
2. Service Nilai: `BEGIN`, `SELECT ... FOR UPDATE` semua nilai kelas itu, ubah `status = 'final'` (hanya yang masih draft).
3. Service Nilai mengambil token service (`POST` ke gateway `/auth/service`, cache sampai mendekati kedaluwarsa), lalu `fetch` ke gateway `POST /transkrip/sinkron` dengan `Authorization: Bearer <token service>` dan payload `{ kelas_id, kode_mk, nama_mk, entries: [{ nim, nilai_angka, nilai_huruf }] }`.
4. Gateway: token service valid, Policy Engine allow (role service), audit, teruskan ke Service Transkrip dengan gateway secret.
5. Service Transkrip: verifikasi gateway secret dan token, pastikan `role = service`, upsert ke tabel `transkrip` (`ON DUPLICATE KEY UPDATE`).
6. Sukses: `COMMIT`, respons 200. Gagal pada langkah 3–5: `ROLLBACK`, respons 502 dengan pesan jelas. Beri timeout (misal 5 detik) pada `fetch`.
7. Konversi huruf (konfigurasi di Service Nilai): >=80 A, >=70 B, >=60 C, >=50 D, selain itu E.

Catatan: `PUT /nilai/:id` juga harus menegakkan `status = 'draft'` di level query (`UPDATE ... WHERE id = ? AND status = 'draft'`, cek `affectedRows`) agar aman dari race condition.

## 9. Variabel Lingkungan (`.env.example`)

```
GATEWAY_PORT=3000
NILAI_PORT=3001
TRANSKRIP_PORT=3002
NILAI_URL=http://127.0.0.1:3001
TRANSKRIP_URL=http://127.0.0.1:3002
GATEWAY_URL=http://127.0.0.1:3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=sistem_nilai
GATEWAY_SECRET=ganti-dengan-string-acak-panjang
SERVICE_CLIENT_ID=service-nilai
SERVICE_CLIENT_SECRET=ganti-dengan-secret-service
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
ACCESS_TOKEN_TTL=10m
SERVICE_TOKEN_TTL=5m
REFRESH_TOKEN_TTL_DAYS=1
ACCESS_HOUR_START=7
ACCESS_HOUR_END=21
ACCESS_TIMEZONE=Asia/Jakarta
```

Service Nilai dan Transkrip **tidak boleh** memiliki akses ke `private.pem` (hanya public key). Skrip `npm run genkeys` membuat pasangan kunci RSA 2048.

## 10. Skenario Uji (otomatis di `tests/run-scenarios.js` + Postman)

| # | Skenario | Hasil yang diharapkan |
|---|----------|-----------------------|
| 1 | Login mhs1 dengan password benar + DEV-MHS-01 | 200, dapat access + refresh token |
| 2 | Login mhs1 dengan device tidak terdaftar | 403, audit `device_not_registered` |
| 3 | Login dengan password salah | 401 |
| 4 | Request tanpa token | 401 |
| 5 | Token kedaluwarsa / tanda tangan salah (token dibuat dengan kunci lain) | 401 |
| 6 | Token valid tetapi device ID milik user lain | 403 |
| 7 | mhs1 `GET /nilai` | 200, hanya nilai mhs1 |
| 8 | mhs1 `GET /transkrip/2210002` | 403 `not_own_nim` |
| 9 | mhs1 `GET /transkrip/2210001` | 200 |
| 10 | admin1 `GET /transkrip/2210002` | 200 |
| 11 | admin1 `GET /nilai` | 403 `role_not_allowed` |
| 12 | dosen1 `GET /nilai?kelas_id=<KI-B>` | 403 `class_not_taught` |
| 13 | dosen1 `PUT /nilai/:id` (kelas sendiri, draft, dalam jam) | 200 |
| 14 | dosen1 `PUT /nilai/:id` milik kelas dosen2 | 403 |
| 15 | dosen1 `PUT /nilai/:id` di luar jam akses (ubah `.env`, restart) | 403 `outside_access_hours` |
| 16 | dosen1 finalisasi KI-A | 200, nilai final, transkrip terisi |
| 17 | dosen1 `PUT /nilai/:id` setelah final | 403 `grade_already_final` |
| 18 | Token user (dosen/admin) memanggil `POST /transkrip/sinkron` | 403 `service_token_required` |
| 19 | Akses langsung ke `:3001` / `:3002` tanpa gateway secret | 401/403 |
| 20 | Akses langsung ke `:3001` dengan gateway secret tetapi tanpa token | 401 |
| 21 | Kirim `X-Gateway-Secret` palsu lewat gateway | Header client diabaikan, kebijakan tetap berlaku |
| 22 | Refresh dengan token valid lalu pakai refresh token lama | Yang lama 401 (rotasi) |
| 23 | Logout lalu refresh dengan token tersebut | 401 `refresh_token_revoked` |
| 24 | Simulasi Service Transkrip mati saat finalisasi | 502, status nilai kembali draft (rollback) |
| 25 | Semua skenario di atas muncul di `audit_log` dengan hasil dan alasan | Ya |

## 11. Checklist Kepatuhan terhadap Spesifikasi Tugas

**4.1 Autentikasi dan Token**
- [ ] Access token JWT berlaku 10 menit, berisi minimal `sub` dan `role`, dikirim via `Authorization: Bearer`
- [ ] Refresh token berlaku 1 hari, disimpan di database, dapat dicabut, logout mencabutnya
- [ ] `POST /auth/service` dengan client ID dan secret, token berlaku 5 menit, `role: service`
- [ ] Gateway menambahkan `X-Gateway-Secret`, service menolak request tanpanya
- [ ] Service memverifikasi ulang tanda tangan dan masa berlaku token, token tidak valid ditolak walau ada gateway secret

**4.2 Kebijakan Akses**
- [ ] Semua endpoint lewat gateway, semua baris Tabel 3 terimplementasi
- [ ] Policy Engine membaca data user, kelas, dan nilai dari DB untuk kebijakan kepemilikan
- [ ] Policy Engine berupa modul `policy.js` yang mengembalikan allow/deny beserta alasan

**4.3 Verifikasi Konteks**
- [ ] `X-Device-ID` diperiksa terhadap device terdaftar milik user
- [ ] Jam akses 07.00–21.00 untuk ubah dan finalisasi nilai, dapat dikonfigurasi

**4.4 Audit Log**
- [ ] Setiap keputusan dicatat: waktu, subjek (user/service), endpoint, device, hasil, alasan

**5. Ketentuan Teknis**
- [ ] Berjalan di satu komputer tanpa frontend, diuji dengan Postman/curl
- [ ] Seed: 1 admin, 2 dosen, 3 mahasiswa, 2 kelas dosen berbeda, tiap user 1 device
- [ ] Gateway (3000), Service Nilai (3001), Service Transkrip (3002), satu database MySQL bersama

**6. Luaran**
- [ ] Repository + README (cara menjalankan, daftar akun, device ID seed)
- [ ] Video demo 6–9 menit yang menunjukkan kode untuk setiap kebutuhan bagian 4

## 12. Outline Video Demo (6–9 menit)

| Waktu | Isi |
|-------|-----|
| 0:00–0:45 | Tujuan, arsitektur (gambar 1), peran PEP/PE/PA, struktur folder |
| 0:45–2:15 | 4.1: login, JWT RS256 (`tokens.js`), refresh + rotasi + logout, token service, gateway secret, verifikasi ulang di service (tunjukkan akses langsung ke 3001 ditolak) |
| 2:15–4:45 | 4.2: `policy.js` per endpoint, demo allow dan deny (mahasiswa lihat NIM orang lain, dosen kelas lain, admin ke /nilai, token user ke /sinkron) |
| 4:45–6:00 | 4.3: device tidak terdaftar, jam akses (ubah `.env`, tunjukkan deny) |
| 6:00–7:15 | Alur finalisasi + sinkron transkrip lewat gateway, rollback saat gagal |
| 7:15–8:30 | 4.4: tampilkan isi tabel `audit_log` (allow dan deny beserta alasan) |
| 8:30–9:00 | Ringkasan prinsip zero trust yang terpenuhi |
