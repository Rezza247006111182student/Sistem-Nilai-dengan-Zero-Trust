# Sistem Nilai Zero Trust

Sistem Nilai dengan arsitektur Zero Trust untuk tugas praktikum mata kuliah Keamanan Informasi. Mengimplementasikan prinsip _never trust, always verify_, _least privilege_, dan _assume breach_ pada level aplikasi mengacu pada NIST SP 800-207.

## Arsitektur

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

## Prasyarat

- **Node.js 18+** (wajib, karena memakai `fetch` bawaan)
- **XAMPP** dengan MySQL berstatus **Running** di port 3306
- **OpenSSL** (biasanya sudah tersedia di Windows melalui Git Bash atau XAMPP)

## Langkah Menjalankan dari Nol

```bash
# 1. Install dependencies
npm install

# 2. Salin file konfigurasi
cp .env.example .env
# Edit .env bila perlu (default XAMPP: root tanpa password, port 3306)

# 3. Generate RSA key pair untuk JWT RS256
npm run genkeys

# 4. Seed database (pastikan MySQL XAMPP sudah Running)
npm run seed

# 5. Jalankan ketiga service
npm start

# 6. Jalankan pengujian (di terminal lain, saat service berjalan)
npm test
```

## Daftar Akun Seed

| Username | Password | Role | NIM | Device ID |
|----------|----------|------|-----|-----------|
| admin1 | Password123! | admin | - | DEV-ADMIN-01 |
| dosen1 | Password123! | dosen | - | DEV-DOSEN-01 |
| dosen2 | Password123! | dosen | - | DEV-DOSEN-02 |
| mhs1 | Password123! | mahasiswa | 2210001 | DEV-MHS-01 |
| mhs2 | Password123! | mahasiswa | 2210002 | DEV-MHS-02 |
| mhs3 | Password123! | mahasiswa | 2210003 | DEV-MHS-03 |

**Kelas:**
- KI-A (id=1): diampu dosen1. Enrollment: mhs1 (85.00), mhs2 (72.50)
- KI-B (id=2): diampu dosen2. Enrollment: mhs2 (68.00), mhs3 (90.00)

**Service Client:** `client_id = service-nilai`, secret dari `.env` (`SERVICE_CLIENT_SECRET`)

## Contoh Perintah `curl`

### Login (sukses)
```bash
curl -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: DEV-MHS-01" \
  -d '{"username":"mhs1","password":"Password123!"}'
```

### Akses sukses — mhs1 lihat nilai
```bash
curl http://127.0.0.1:3000/nilai \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "X-Device-ID: DEV-MHS-01"
```

### Akses ditolak — mhs1 lihat transkrip NIM orang lain
```bash
curl http://127.0.0.1:3000/transkrip/2210002 \
  -H "Authorization: Bearer <ACCESS_TOKEN_MHS1>" \
  -H "X-Device-ID: DEV-MHS-01"
# Respons: 403 {"error":"not_own_nim"}
```

### Refresh token
```bash
curl -X POST http://127.0.0.1:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: DEV-MHS-01" \
  -d '{"refresh_token":"<REFRESH_TOKEN>"}'
```

### Logout
```bash
curl -X POST http://127.0.0.1:3000/auth/logout \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: DEV-MHS-01" \
  -d '{"refresh_token":"<REFRESH_TOKEN>"}'
```

### Finalisasi (dosen1 finalisasi KI-A)
```bash
curl -X POST http://127.0.0.1:3000/kelas/1/finalisasi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN_DOSEN1>" \
  -H "X-Device-ID: DEV-DOSEN-01"
```

## Pemetaan Kebutuhan ke Kode

| Kebutuhan | Deskripsi | File & Fungsi |
|-----------|-----------|---------------|
| **4.1** Autentikasi dan Token | Access token JWT RS256, 10 menit | `gateway/auth/tokens.js` → `signAccessToken()` |
| | Refresh token (hash SHA-256, rotasi, cabut) | `gateway/auth/tokens.js` → `rotateRefreshToken()`, `revokeRefreshToken()` |
| | Login, refresh, logout | `gateway/auth/authRoutes.js` → `POST /login`, `/refresh`, `/logout` |
| | Token service | `gateway/auth/authRoutes.js` → `POST /service`, `tokens.js` → `signServiceToken()` |
| | Gateway secret (tambah & hapus) | `gateway/proxy.js` → `onProxyReq`, `gateway/middleware/enforce.js` → `delete req.headers` |
| | Verifikasi ulang JWT di service | `service-nilai/middleware/verifyToken.js`, `service-transkrip/middleware/verifyToken.js` |
| | Verifikasi gateway secret di service | `service-nilai/middleware/gatewaySecret.js`, `service-transkrip/middleware/gatewaySecret.js` |
| **4.2** Kebijakan Akses | Policy Engine (decide → allow/deny + alasan) | `gateway/policy.js` → `decide()` |
| | Semua endpoint lewat gateway | `gateway/server.js` → routing + middleware chain |
| | Kepemilikan dari DB | `gateway/policy.js` → query `kelas`, `users`, `nilai` |
| | Deny by default | `gateway/policy.js` → return `unknown_endpoint` |
| **4.3** Verifikasi Konteks | Device terdaftar | `gateway/middleware/deviceCheck.js` |
| | Jam akses (07:00–21:00 WIB) | `gateway/policy.js` → `isWithinAccessHours()` |
| **4.4** Audit Log | Setiap keputusan dicatat | `gateway/audit.js` → `logAudit()` |
| | Dipanggil dari enforce | `gateway/middleware/enforce.js` |

## Cara Mendemokan Jam Akses

1. Buka file `.env`
2. Ubah `ACCESS_HOUR_START` dan `ACCESS_HOUR_END`, contoh:
   ```
   ACCESS_HOUR_START=0
   ACCESS_HOUR_END=1
   ```
   (jam akses hanya 00:00–01:00, sehingga di luar jam tersebut akan ditolak)
3. Restart gateway (`Ctrl+C`, lalu `npm start`)
4. Coba `PUT /nilai/:id` atau `POST /kelas/:id/finalisasi` → akan mendapat `403 outside_access_hours`
5. Kembalikan ke nilai semula dan restart lagi

## Cara Menampilkan Audit Log

Buka MySQL client (phpMyAdmin atau command line):

```sql
SELECT * FROM sistem_nilai.audit_log ORDER BY waktu DESC LIMIT 20;
```

Atau melalui XAMPP phpMyAdmin: buka `http://localhost/phpmyadmin`, pilih database `sistem_nilai`, klik tabel `audit_log`.

## Asumsi

1. **Device ID di /auth/refresh dan /auth/logout**: Mengikuti SPEC.md yang menyatakan X-Device-ID diwajibkan untuk "setiap request dari user", termasuk refresh dan logout.
2. **Refresh token terikat device**: Refresh token hanya dapat digunakan dari device yang sama saat login. Jika device berbeda, refresh ditolak.
3. **Endpoint tidak dikenali**: Semua endpoint/method yang tidak ada di Tabel 3 SPEC.md dikembalikan dengan `403 unknown_endpoint` (deny by default).
4. **Pesan error login generik**: Pesan error ke client untuk login dibuat generik ("Kredensial tidak valid"), alasan rinci hanya masuk audit log.
5. **Skenario 15 dan 24**: Diuji manual karena memerlukan perubahan konfigurasi atau mematikan service.
6. **Nilai awal terisi**: Seed data memiliki nilai_angka terisi (draft) agar bisa langsung diuji finalisasi.
7. **Database XAMPP default**: Host 127.0.0.1, port 3306, user root, password kosong.

