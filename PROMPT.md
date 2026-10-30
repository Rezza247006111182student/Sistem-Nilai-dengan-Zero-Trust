# PROMPT — Bangun Proyek Sistem Nilai Zero Trust

> Cara pakai: letakkan `SPEC.md` dan `PROMPT.md` di folder proyek (atau lampirkan keduanya bila memakai chat), lalu tempelkan isi di bawah garis ini ke AI coding assistant.

---

Kamu adalah software engineer senior yang ahli keamanan aplikasi dan Node.js. Bangun proyek **Sistem Nilai dengan arsitektur Zero Trust** untuk tugas praktikum mata kuliah Keamanan Informasi. Penilaian berfokus pada **mekanisme kontrol akses**, bukan tampilan, jadi tidak perlu frontend.

## Sumber kebenaran

Baca **`SPEC.md` secara lengkap terlebih dahulu**. Dokumen itu berisi keputusan teknis, arsitektur, matriks kebijakan, skema database, data seed, struktur folder, skenario uji, dan checklist kepatuhan. Ikuti SPEC.md secara ketat. Jangan mengganti keputusan di dalamnya (stack, RS256, MySQL XAMPP, rollback saat sinkron gagal, dan seterusnya). Jika ada ambiguitas, pilih opsi yang paling sesuai dengan SPEC.md dan catat di README bagian "Asumsi", jangan berhenti untuk bertanya.

## Ringkasan sistem

- **API Gateway (port 3000)** sebagai PEP, satu-satunya pintu masuk. Di dalamnya ada modul Policy Engine/Policy Administrator (`policy.js`, login, penerbitan dan pencabutan token) dan pencatatan audit log.
- **Service Nilai (port 3001)** dan **Service Transkrip (port 3002)**, dua aplikasi Express terpisah.
- **Satu database MySQL dari XAMPP** (`sistem_nilai`) yang dipakai bersama oleh semuanya.
- Peran: mahasiswa, dosen, admin dengan kebijakan pada Tabel 3 di SPEC.md.
- Saat dosen memfinalisasi kelas, Service Nilai memanggil `POST /transkrip/sinkron` **melalui gateway** memakai token service.

## Aturan keamanan yang tidak boleh dilanggar

1. Service tidak boleh dapat diakses langsung: wajib `X-Gateway-Secret` (bandingkan dengan `crypto.timingSafeEqual`). Gateway harus **menghapus** header `X-Gateway-Secret` kiriman client sebelum menambahkan miliknya.
2. Service wajib **memverifikasi ulang** tanda tangan dan masa berlaku JWT dengan public key (`algorithms: ['RS256']`). Request tanpa token valid ditolak walau membawa gateway secret.
3. Private key JWT hanya dibaca gateway. Service hanya memakai public key.
4. Kebijakan kepemilikan (kelas yang diampu, NIM milik mahasiswa) diputuskan Policy Engine dari **database**, bukan dari isi token. Token hanya berisi `sub` dan `role` (plus `iat`, `exp`, `iss`, `jti`).
5. **Deny by default** untuk endpoint atau kondisi yang tidak dikenali.
6. Semua query memakai parameter binding. Password di-hash dengan bcryptjs. Refresh token disimpan sebagai hash SHA-256, dirotasi, dan terikat device. Jangan pernah mencatat password atau token di log.
7. Body JSON hanya diparse di route yang membutuhkannya (`/auth/*`). Untuk route yang di-proxy, jangan merusak stream body (gunakan `fixRequestBody` bila perlu).
8. Setiap keputusan akses (allow maupun deny, termasuk login gagal, token tidak valid, dan panggilan service) dicatat ke `audit_log`: waktu, subjek, endpoint, device, hasil, alasan.

## Cara kerja (urutan pengerjaan)

Kerjakan bertahap. Setelah setiap tahap, jalankan dan verifikasi sebelum lanjut.

1. **Scaffold**: struktur folder sesuai SPEC.md bagian 7, `package.json` (scripts: `genkeys`, `seed`, `start`, `test`; jalankan 3 proses dengan `concurrently`), `.env.example`, `.gitignore` (abaikan `.env` dan `keys/`).
2. **Database**: `db/schema.sql` dan `db/seed.js` untuk MySQL XAMPP, idempotent, membuat database bila belum ada, mengisi seed persis seperti SPEC.md bagian 6.
3. **Gateway: autentikasi** (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/service`) beserta penerbitan token RS256.
4. **Gateway: PEP** (verifikasi token, cek device, `policy.js`, audit, proxy dengan gateway secret).
5. **Service Transkrip** lalu **Service Nilai** (verifikasi gateway secret dan token, endpoint sesuai Tabel 3, alur finalisasi dengan transaksi dan rollback).
6. **Pengujian**: `tests/run-scenarios.js` yang menjalankan seluruh skenario di SPEC.md bagian 10 dan mencetak PASS/FAIL per skenario. Buat juga koleksi Postman dengan environment variable untuk token dan device.
7. **Dokumentasi**: `README.md` (lihat di bawah).

## Standar kode

- Kode modular: satu file atau fungsi untuk satu kebutuhan, supaya mudah ditunjuk di video demo.
- Beri komentar singkat berbahasa Indonesia di bagian penting yang menyebut kebutuhan yang dipenuhi, contoh: `// Kebutuhan 4.3: verifikasi device terdaftar`.
- Tangani error dengan kode HTTP yang tepat (400/401/403/404/502) dan pesan JSON yang konsisten, tanpa membocorkan detail internal ke client.
- Konfigurasi (jam akses, secret, port, kredensial DB) hanya dari `.env`, jangan hardcode.
- Gunakan dependensi seminimal mungkin: `express`, `http-proxy-middleware`, `jsonwebtoken`, `mysql2`, `bcryptjs`, `dotenv`, `concurrently` (dev), tidak ada ORM.

## Isi README.md

1. Prasyarat (Node.js 18+, XAMPP dengan MySQL berstatus Running) dan langkah menjalankan dari nol: `npm install`, salin `.env.example` ke `.env`, `npm run genkeys`, `npm run seed`, `npm start`, `npm test`.
2. Daftar akun seed (username, password, role, NIM) dan **device ID** masing-masing.
3. Contoh perintah `curl` untuk: login, akses sukses, akses ditolak, refresh, logout, finalisasi.
4. Tabel pemetaan **kebutuhan 4.1–4.4 ke file dan fungsi** yang menanganinya (untuk acuan video demo).
5. Cara mendemokan jam akses (ubah `ACCESS_HOUR_START` dan `ACCESS_HOUR_END`, restart gateway) dan cara menampilkan `audit_log`.
6. Bagian "Asumsi" untuk keputusan yang diambil di luar spesifikasi tugas.

## Definisi selesai

- `npm run seed` lalu `npm start` menjalankan tiga proses tanpa error pada XAMPP MySQL default.
- `npm test` menampilkan semua skenario di SPEC.md bagian 10 berstatus PASS.
- Seluruh checklist di SPEC.md bagian 11 terpenuhi.
- Akses langsung ke port 3001 dan 3002 tanpa gateway secret selalu ditolak.

## Format jawabanmu

Sebelum menulis kode, tampilkan rencana singkat (daftar file yang akan dibuat). Lalu buat semua file, jalankan seed dan pengujian, dan akhiri dengan ringkasan: apa yang sudah dibuat, hasil `npm test`, serta asumsi apa pun yang kamu ambil.
