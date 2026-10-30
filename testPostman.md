# Panduan Pengujian dengan Postman — Sistem Nilai Zero Trust

Dokumen ini berisi daftar lengkap request yang dapat diuji memakai aplikasi **Postman** terhadap proyek Sistem Nilai Zero Trust. Setiap request dilengkapi method, URL, header, body, dan hasil yang diharapkan, sehingga bisa dipakai langsung saat demo/praktikum.

> Prasyarat: MySQL XAMPP **Running**, sudah menjalankan `npm run seed`, `npm run genkeys`, lalu `npm start` (gateway :3000, service nilai :3001, service transkrip :3002).

---

## 1. Environment Postman

Buat **Environment** baru (mis. `Sistem Nilai - Local`) lalu isi variabel berikut:

| Variabel | Initial Value | Keterangan |
|----------|---------------|------------|
| `base_url` | `http://127.0.0.1:3000` | Gateway (satu-satunya pintu masuk) |
| `nilai_direct` | `http://127.0.0.1:3001` | Service Nilai (untuk uji akses langsung) |
| `transkrip_direct` | `http://127.0.0.1:3002` | Service Transkrip (untuk uji akses langsung) |
| `device_id` | `DEV-MHS-01` | Device default untuk pengujian mahasiswa |
| `gateway_secret` | *(salin dari `.env` → `GATEWAY_SECRET`)* | Hanya untuk uji akses langsung ke service |
| `service_client_id` | `service-nilai` | Client ID service |
| `service_client_secret` | *(salin dari `.env` → `SERVICE_CLIENT_SECRET`)* | Secret service |
| `access_token` | *(kosong)* | Diisi otomatis dari login mhs1 |
| `refresh_token` | *(kosong)* | Diisi otomatis dari login mhs1 |
| `mhs1_token` | *(kosong)* | Token mhs1 |
| `admin_token` | *(kosong)* | Token admin1 |
| `dosen1_token` | *(kosong)* | Token dosen1 |
| `dosen2_token` | *(kosong)* | Token dosen2 |
| `service_token` | *(kosong)* | Token service hasil `POST /auth/service` |

**Jangan** menuliskan secret asli ke file yang di-commit. Cukup isi di Environment Postman.

### Test script otomatis untuk menyimpan token

Tempel di tab **Tests** pada request login:

```javascript
// Simpan token ke environment
const data = pm.response.json();
pm.environment.set("access_token", data.access_token);
pm.environment.set("refresh_token", data.refresh_token);

pm.test("Status 200", () => pm.response.to.have.status(200));
pm.test("Access token ada", () => pm.expect(data.access_token).to.be.a("string"));
pm.test("Refresh token ada", () => pm.expect(data.refresh_token).to.be.a("string"));
```

Untuk login role lain, ganti nama variabel yang disimpan (`admin_token`, `dosen1_token`, `dosen2_token`, `mhs1_token`).

---

## 2. Data Seed yang Dipakai

| Username | Password | Role | NIM | Device ID |
|----------|----------|------|-----|-----------|
| admin1 | Password123! | admin | - | DEV-ADMIN-01 |
| dosen1 | Password123! | dosen | - | DEV-DOSEN-01 |
| dosen2 | Password123! | dosen | - | DEV-DOSEN-02 |
| mhs1 | Password123! | mahasiswa | 2210001 | DEV-MHS-01 |
| mhs2 | Password123! | mahasiswa | 2210002 | DEV-MHS-02 |
| mhs3 | Password123! | mahasiswa | 2210003 | DEV-MHS-03 |

Kelas: `KI-A` (id=1) diampu dosen1; `KI-B` (id=2) diampu dosen2.
Nilai awal: id 1 = mhs1/KI-A (85), id 2 = mhs2/KI-A (72.5), id 3 = mhs2/KI-B (68), id 4 = mhs3/KI-B (90).

> Catatan: jika database di-seed ulang, ID kelas/nilai kembali 1,2,3,4.

---

## 3. Urutan Pengujian yang Disarankan

1. Login semua akun (bagian 4) untuk mengisi token.
2. Uji `/nilai` dan `/transkrip` (bagian 5 dan 7).
3. Uji finalisasi (bagian 6) setelah semua uji `PUT` draft selesai.
4. Uji keamanan (bagian 8).
5. Cek `audit_log` (bagian 9).
6. Uji manual yang butuh restart (bagian 10).

---

## 4. Autentikasi (`/auth/*`)

Semua request `/auth/*` ditangani langsung oleh gateway (port 3000).

### A1 — Login mhs1 (sukses)

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:**
  - `Content-Type: application/json`
  - `X-Device-ID: DEV-MHS-01`
- **Body (raw JSON):**

```json
{
  "username": "mhs1",
  "password": "Password123!"
}
```

- **Diharapkan:** `200 OK`, body berisi `access_token`, `refresh_token`, `token_type: "Bearer"`.
- **Audit:** `allow` / `login_success`.

---

### A2 — Login mhs1 dengan device tidak terdaftar

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-UNKNOWN`
- **Body:** sama seperti A1.
- **Diharapkan:** `403 Forbidden`, `{"error":"Device tidak terdaftar."}`.
- **Audit:** `deny` / `device_not_registered`.

---

### A3 — Login tanpa `X-Device-ID`

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:** `Content-Type: application/json`
- **Body:** sama seperti A1.
- **Diharapkan:** `403 Forbidden`, `device_not_registered`.

---

### A4 — Login password salah

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:**

```json
{
  "username": "mhs1",
  "password": "PasswordSalah"
}
```

- **Diharapkan:** `401 Unauthorized`, pesan generik `{"error":"Kredensial tidak valid."}`.
- **Audit:** `deny` / `invalid_credentials`.

---

### A5 — Login username tidak ada

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:**

```json
{
  "username": "tidakada",
  "password": "Password123!"
}
```

- **Diharapkan:** `401 Unauthorized` (pesan generik, tidak membocorkan user ada/tidak).
- **Audit:** `deny` / `invalid_credentials`.

---

### A6 — Login admin1

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-ADMIN-01`
- **Body:**

```json
{
  "username": "admin1",
  "password": "Password123!"
}
```

- **Diharapkan:** `200 OK`. Simpan `access_token` ke variabel `admin_token`.

---

### A7 — Login dosen1

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-DOSEN-01`
- **Body:** `{"username":"dosen1","password":"Password123!"}`
- **Diharapkan:** `200 OK`. Simpan ke `dosen1_token`.

---

### A8 — Login dosen2

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-DOSEN-02`
- **Body:** `{"username":"dosen2","password":"Password123!"}`
- **Diharapkan:** `200 OK`. Simpan ke `dosen2_token`.

---

### A9 — Refresh token (rotasi)

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/refresh`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:**

```json
{
  "refresh_token": "{{refresh_token}}"
}
```

- **Diharapkan:** `200 OK`, keluar `access_token` dan `refresh_token` **baru**. Refresh token lama otomatis dicabut.
- **Audit:** `allow` / `refresh_success`.

> Simpan token baru lewat test script. Jika tidak, request berikutnya memakai token lama.

---

### A10 — Refresh memakai refresh token lama (setelah rotasi)

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/refresh`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:** gunakan refresh token **lama** (sebelum A9).
- **Diharapkan:** `401 Unauthorized`.
- **Audit:** `deny` / `refresh_token_revoked`.

---

### A11 — Refresh dengan device berbeda

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/refresh`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-02`
- **Body:** `{"refresh_token":"{{refresh_token}}"}`
- **Diharapkan:** `401 Unauthorized` (refresh token terikat device).
- **Audit:** `deny` / `refresh_token_invalid`.

---

### A12 — Refresh tanpa `X-Device-ID`

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/refresh`
- **Headers:** `Content-Type: application/json`
- **Body:** `{"refresh_token":"{{refresh_token}}"}`
- **Diharapkan:** `403 Forbidden`, `device_not_registered`.

---

### A13 — Logout

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/logout`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:** `{"refresh_token":"{{refresh_token}}"}`
- **Diharapkan:** `200 OK`, `{"message":"Logout berhasil."}`.
- **Audit:** `allow` / `logout_success`.

---

### A14 — Logout lalu refresh dengan token tersebut

Lakukan A13, lalu ulangi A9 dengan refresh token yang sama.

- **Diharapkan:** `401 Unauthorized`.
- **Audit:** `deny` / `refresh_token_revoked`.

---

### A15 — Logout dengan refresh token tidak valid

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/logout`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:** `{"refresh_token":"token-palsu"}`
- **Diharapkan:** `401 Unauthorized`.

---

### A16 — Ambil token service (sukses)

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/service`
- **Headers:** `Content-Type: application/json`
- **Body:**

```json
{
  "client_id": "{{service_client_id}}",
  "client_secret": "{{service_client_secret}}"
}
```

- **Diharapkan:** `200 OK`, `{"access_token":"<JWT role=service>","token_type":"Bearer"}`. Simpan ke `service_token`.
- **Test script:**

```javascript
const data = pm.response.json();
pm.environment.set("service_token", data.access_token);
pm.test("Status 200", () => pm.response.to.have.status(200));
```

- **Audit:** `allow` / `service_token_issued`.

---

### A17 — Token service dengan secret salah

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/service`
- **Headers:** `Content-Type: application/json`
- **Body:** `{"client_id":"service-nilai","client_secret":"secret-salah"}`
- **Diharapkan:** `401 Unauthorized`.
- **Audit:** `deny` / `invalid_service_credentials`.

---

### A18 — Token service tanpa body

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/service`
- **Headers:** `Content-Type: application/json`
- **Body:** `{}`
- **Diharapkan:** `401 Unauthorized`.

---

## 5. Nilai (`/nilai`, `/kelas`)

Semua request lewat gateway dan wajib `Authorization: Bearer <token>` + `X-Device-ID`.

### N1 — mhs1 lihat nilainya sendiri

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:**
  - `Authorization: Bearer {{mhs1_token}}`
  - `X-Device-ID: DEV-MHS-01`
- **Diharapkan:** `200 OK`, hanya baris nilai milik mhs1 (id 1).
- **Audit:** `allow` / `own_grades`.

---

### N2 — Request tanpa token

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:** `X-Device-ID: DEV-MHS-01`
- **Diharapkan:** `401 Unauthorized`.
- **Audit:** `deny` / `token_missing`.

---

### N3 — Token tidak valid (tanda tangan dirusak)

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:**
  - `Authorization: Bearer {{mhs1_token}}X` *(ubah 1 karakter terakhir token)*
  - `X-Device-ID: DEV-MHS-01`
- **Diharapkan:** `401 Unauthorized`.
- **Audit:** `deny` / `token_invalid`.

---

  ### N4 — Token valid tetapi device milik user lain

  - **Method:** `GET`
  - **URL:** `{{base_url}}/nilai`
  - **Headers:**
    - `Authorization: Bearer {{mhs1_token}}`
    - `X-Device-ID: DEV-MHS-02` *(device milik mhs2)*
  - **Diharapkan:** `403 Forbidden`, `device_not_registered`.

  ---

### N5 — mhs1 tanpa `X-Device-ID`

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:** `Authorization: Bearer {{mhs1_token}}`
- **Diharapkan:** `403 Forbidden`, `device_not_registered`.

---

### N6 — dosen1 lihat nilai kelas yang diampu

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai?kelas_id=1`
- **Headers:**
  - `Authorization: Bearer {{dosen1_token}}`
  - `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `200 OK`, menampilkan nilai KI-A (mhs1 dan mhs2).
- **Audit:** `allow` / `class_taught`.

---

### N7 — dosen1 tanpa `kelas_id`

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:** `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `403 Forbidden`, `{"error":"kelas_id_required"}`.

---

### N8 — dosen1 lihat kelas dosen2

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai?kelas_id=2`
- **Headers:** `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `403 Forbidden`, `{"error":"class_not_taught"}`.

---

### N9 — dosen1 lihat kelas yang tidak ada

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai?kelas_id=999`
- **Headers:** `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `403 Forbidden`, `class_not_taught`.

---

### N10 — admin lihat `/nilai` (ditolak)

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:** `Authorization: Bearer {{admin_token}}`, `X-Device-ID: DEV-ADMIN-01`
- **Diharapkan:** `403 Forbidden`, `{"error":"role_not_allowed"}`.

---

### N11 — dosen1 ubah nilai draft miliknya

- **Method:** `PUT`
- **URL:** `{{base_url}}/nilai/1`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {{dosen1_token}}`
  - `X-Device-ID: DEV-DOSEN-01`
- **Body:**

```json
{
  "nilai_angka": 90
}
```

- **Diharapkan:** `200 OK`, `{"message":"Nilai berhasil diubah.", ...}`.
- **Audit:** `allow` / `grade_update_allowed`.
- **Catatan:** harus dijalankan dalam jam akses (default 07:00–21:00 WIB) dan nilai masih `draft`.

---

### N12 — dosen1 ubah nilai kelas dosen2

- **Method:** `PUT`
- **URL:** `{{base_url}}/nilai/3` *(nilai milik KI-B)*
- **Headers/Body:** sama seperti N11.
- **Diharapkan:** `403 Forbidden`, `{"error":"class_not_taught"}`.

---

### N13 — mahasiswa ubah nilai

- **Method:** `PUT`
- **URL:** `{{base_url}}/nilai/1`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {{mhs1_token}}`
  - `X-Device-ID: DEV-MHS-01`
- **Body:** `{"nilai_angka":100}`
- **Diharapkan:** `403 Forbidden`, `{"error":"role_not_allowed"}`.

---

### N14 — dosen1 ubah nilai yang tidak ada

- **Method:** `PUT`
- **URL:** `{{base_url}}/nilai/9999`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Body:** `{"nilai_angka":80}`
- **Diharapkan:** `404 Not Found`, `{"error":"grade_not_found"}`.

---

### N15 — Body `nilai_angka` tidak dikirim

- **Method:** `PUT`
- **URL:** `{{base_url}}/nilai/1`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Body:** `{}`
- **Diharapkan:** `400 Bad Request` (validasi di Service Nilai).

---

### N16 — Kirim `X-Gateway-Secret` palsu lewat gateway

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:**
  - `Authorization: Bearer {{mhs1_token}}`
  - `X-Device-ID: DEV-MHS-01`
  - `X-Gateway-Secret: secret-palsu`
- **Diharapkan:** `200 OK` (header palsu dihapus gateway lalu diganti milik gateway). Kebijakan tetap berlaku.

---

## 6. Finalisasi Kelas

### K1 — dosen1 finalisasi KI-A

- **Method:** `POST`
- **URL:** `{{base_url}}/kelas/1/finalisasi`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {{dosen1_token}}`
  - `X-Device-ID: DEV-DOSEN-01`
- **Body:** `{}` (tidak wajib)
- **Diharapkan:** `200 OK`, `{"message":"Finalisasi berhasil...","finalized_count":2}`.
- **Efek:** status nilai KI-A menjadi `final`, tabel `transkrip` terisi untuk 2210001 dan 2210002.
- **Audit:** `allow` / `finalization_allowed`, lalu `allow` / `service_sync` untuk panggilan service.

---

### K2 — dosen2 finalisasi kelas dosen1

- **Method:** `POST`
- **URL:** `{{base_url}}/kelas/1/finalisasi`
- **Headers:** `Authorization: Bearer {{dosen2_token}}`, `X-Device-ID: DEV-DOSEN-02`
- **Diharapkan:** `403 Forbidden`, `class_not_taught`.

---

### K3 — mahasiswa finalisasi

- **Method:** `POST`
- **URL:** `{{base_url}}/kelas/1/finalisasi`
- **Headers:** `Authorization: Bearer {{mhs1_token}}`, `X-Device-ID: DEV-MHS-01`
- **Diharapkan:** `403 Forbidden`, `role_not_allowed`.

---

### K4 — finalisasi kelas tidak ada

- **Method:** `POST`
- **URL:** `{{base_url}}/kelas/999/finalisasi`
- **Headers:** `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `403 Forbidden`, `class_not_taught`.

---

### K5 — ubah nilai setelah final

Jalankan **setelah K1**.

- **Method:** `PUT`
- **URL:** `{{base_url}}/nilai/1`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Body:** `{"nilai_angka":95}`
- **Diharapkan:** `403 Forbidden`, `{"error":"grade_already_final"}`.

---

## 7. Transkrip dan Sinkronisasi

### T1 — mhs1 lihat transkrip NIM sendiri

- **Method:** `GET`
- **URL:** `{{base_url}}/transkrip/2210001`
- **Headers:** `Authorization: Bearer {{mhs1_token}}`, `X-Device-ID: DEV-MHS-01`
- **Diharapkan:** `200 OK`, `{"data":[...]}` (kosong sebelum finalisasi, terisi setelah K1).
- **Audit:** `allow` / `own_transcript`.

---

### T2 — mhs1 lihat transkrip NIM orang lain

- **Method:** `GET`
- **URL:** `{{base_url}}/transkrip/2210002`
- **Headers:** `Authorization: Bearer {{mhs1_token}}`, `X-Device-ID: DEV-MHS-01`
- **Diharapkan:** `403 Forbidden`, `{"error":"not_own_nim"}`.

---

### T3 — admin lihat transkrip NIM siapa saja

- **Method:** `GET`
- **URL:** `{{base_url}}/transkrip/2210002`
- **Headers:** `Authorization: Bearer {{admin_token}}`, `X-Device-ID: DEV-ADMIN-01`
- **Diharapkan:** `200 OK`.
- **Audit:** `allow` / `admin_access`.

---

### T4 — dosen lihat transkrip (ditolak)

- **Method:** `GET`
- **URL:** `{{base_url}}/transkrip/2210001`
- **Headers:** `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `403 Forbidden`, `role_not_allowed`.

---

### T5 — Sinkronisasi transkrip dengan token service (sukses)

- **Method:** `POST`
- **URL:** `{{base_url}}/transkrip/sinkron`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {{service_token}}`
- **Body:**

```json
{
  "kelas_id": 1,
  "kode_mk": "KI-A",
  "nama_mk": "Keamanan Informasi A",
  "entries": [
    { "nim": "2210001", "nilai_angka": 85, "nilai_huruf": "A" },
    { "nim": "2210002", "nilai_angka": 72.5, "nilai_huruf": "B" }
  ]
}
```

- **Diharapkan:** `200 OK`, `{"message":"Sinkronisasi transkrip berhasil.","count":2}`.
- **Audit:** `allow` / `service_sync`.

---

### T6 — Sinkronisasi memakai token user (ditolak)

- **Method:** `POST`
- **URL:** `{{base_url}}/transkrip/sinkron`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {{dosen1_token}}`
  - `X-Device-ID: DEV-DOSEN-01`
- **Body:** sama seperti T5.
- **Diharapkan:** `403 Forbidden`, `{"error":"service_token_required"}`.

---

### T7 — Sinkronisasi dengan payload tidak lengkap

- **Method:** `POST`
- **URL:** `{{base_url}}/transkrip/sinkron`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer {{service_token}}`
- **Body:** `{"kelas_id":1}`
- **Diharapkan:** `400 Bad Request`, `{"error":"Payload sinkronisasi tidak lengkap."}`.

---

### T8 — Sinkronisasi tanpa token

- **Method:** `POST`
- **URL:** `{{base_url}}/transkrip/sinkron`
- **Headers:** `Content-Type: application/json`
- **Body:** sama seperti T5.
- **Diharapkan:** `401 Unauthorized`.

---

## 8. Uji Keamanan (Akses Langsung ke Service)

Service nilai/transkrip **tidak boleh** bisa diakses tanpa gateway secret. Untuk uji ini isi `gateway_secret` di Environment dari `.env`.

### S1 — Akses langsung :3001 tanpa gateway secret

- **Method:** `GET`
- **URL:** `{{nilai_direct}}/nilai`
- **Headers:** *(kosong)*
- **Diharapkan:** `403 Forbidden`, `{"error":"Akses langsung tidak diizinkan."}`.

---

### S2 — Akses langsung :3001 dengan gateway secret tetapi tanpa token

- **Method:** `GET`
- **URL:** `{{nilai_direct}}/nilai`
- **Headers:** `X-Gateway-Secret: {{gateway_secret}}`
- **Diharapkan:** `401 Unauthorized`, `{"error":"Token tidak ada."}`.

---

### S3 — Akses langsung :3001 dengan gateway secret + token valid

- **Method:** `GET`
- **URL:** `{{nilai_direct}}/nilai`
- **Headers:**
  - `X-Gateway-Secret: {{gateway_secret}}`
  - `Authorization: Bearer {{mhs1_token}}`
- **Diharapkan:** `200 OK`.
- **Catatan demo:** request ini **melewati** Policy Engine dan device check, sehingga membuktikan pentingnya gateway sebagai satu-satunya pintu masuk.

---

### S4 — Akses langsung :3001 dengan gateway secret salah

- **Method:** `GET`
- **URL:** `{{nilai_direct}}/nilai`
- **Headers:** `X-Gateway-Secret: salah`, `Authorization: Bearer {{mhs1_token}}`
- **Diharapkan:** `403 Forbidden`.

---

### S5 — Akses langsung :3002 tanpa gateway secret

- **Method:** `GET`
- **URL:** `{{transkrip_direct}}/transkrip/2210001`
- **Headers:** *(kosong)*
- **Diharapkan:** `403 Forbidden`.

---

### S6 — Akses langsung :3002 dengan gateway secret + token valid

- **Method:** `GET`
- **URL:** `{{transkrip_direct}}/transkrip/2210001`
- **Headers:**
  - `X-Gateway-Secret: {{gateway_secret}}`
  - `Authorization: Bearer {{admin_token}}`
- **Diharapkan:** `200 OK`.

---

### S7 — Endpoint tidak dikenal (deny by default)

- **Method:** `GET`
- **URL:** `{{base_url}}/admin`
- **Headers:** `Authorization: Bearer {{admin_token}}`, `X-Device-ID: DEV-ADMIN-01`
- **Diharapkan:** `403 Forbidden`, `{"error":"unknown_endpoint"}`.

---

### S8 — Method salah pada endpoint yang ada

- **Method:** `DELETE`
- **URL:** `{{base_url}}/nilai/1`
- **Headers:** `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `403 Forbidden`, `unknown_endpoint`.

---

### S9 — Akses ke service transkrip dengan token salah tanda tangan

- **Method:** `GET`
- **URL:** `{{transkrip_direct}}/transkrip/2210001`
- **Headers:**
  - `X-Gateway-Secret: {{gateway_secret}}`
  - `Authorization: Bearer {{admin_token}}X`
- **Diharapkan:** `401 Unauthorized` (service memverifikasi ulang JWT).

---

## 9. Audit Log

Setiap keputusan (allow/deny) tercatat. Cek lewat phpMyAdmin atau MySQL client:

```sql
SELECT waktu, subject_type, subject_id, endpoint, device_id, hasil, alasan
FROM sistem_nilai.audit_log
ORDER BY waktu DESC
LIMIT 50;
```

Yang harus terlihat dari pengujian di atas:

| Aksi | `hasil` | `alasan` |
|------|---------|----------|
| Login sukses | allow | `login_success` |
| Login device salah | deny | `device_not_registered` |
| Login password salah | deny | `invalid_credentials` |
| Tanpa token | deny | `token_missing` |
| Token rusak | deny | `token_invalid` |
| mhs1 NIM orang lain | deny | `not_own_nim` |
| dosen kelas lain | deny | `class_not_taught` |
| admin `/nilai` | deny | `role_not_allowed` |
| tanpa `kelas_id` | deny | `kelas_id_required` |
| setelah final | deny | `grade_already_final` |
| endpoint asing | deny | `unknown_endpoint` |
| finalisasi sukses | allow | `finalization_allowed` |
| panggilan sinkron service | allow | `service_sync` |
| endpoint tidak dikenal | deny | `unknown_endpoint` |

---

## 10. Pengujian Manual (Butuh Restart / Perubahan Konfigurasi)

### M1 — Token kedaluwarsa

1. Ubah `.env`: `ACCESS_TOKEN_TTL=1s`.
2. Restart `npm start`.
3. Login mhs1, salin token.
4. Tunggu ±3 detik, lalu `GET {{base_url}}/nilai` dengan token tersebut.
5. **Diharapkan:** `401 Unauthorized` (audit `token_expired`).
6. Kembalikan `ACCESS_TOKEN_TTL=10m` dan restart.

### M2 — Di luar jam akses

1. Ubah `.env`: `ACCESS_HOUR_START=0` dan `ACCESS_HOUR_END=1`.
2. Restart `npm start`.
3. `PUT /nilai/1` dengan dosen1 (nilai masih draft).
4. **Diharapkan:** `403 Forbidden`, `outside_access_hours`.
5. `POST /kelas/1/finalisasi` juga `403 outside_access_hours`.
6. Kembalikan `7` dan `21`, restart.
7. Catatan: `GET /nilai` **tidak** dibatasi jam akses.

### M3 — Service Transkrip mati saat finalisasi (rollback)

1. Jalankan `npm start`, lalu matikan proses transkrip (atau stop service :3002).
2. Reset database agar KI-A masih draft: `npm run seed`.
3. Login ulang dosen1.
4. `POST /kelas/1/finalisasi`.
5. **Diharapkan:** `502 Bad Gateway`, pesan sinkronisasi gagal.
6. Cek `SELECT id,status FROM nilai WHERE kelas_id=1;` → status tetap `draft` (rollback berhasil).
7. Nyalakan lagi service transkrip dan ulangi finalisasi → `200 OK`.

### M4 — Token dengan kunci lain (signature salah)

Cara cepat: ubah satu karakter pada token valid (lihat N3). Untuk uji tanda tangan dengan kunci RSA lain, buat token di [jwt.io](https://jwt.io) memakai private key berbeda dengan payload `{"sub":"1","role":"admin","iss":"sistem-nilai-gateway"}`, lalu kirim sebagai Bearer. **Diharapkan:** `401 Unauthorized`.

### M5 — Refresh token kedaluwarsa

Ubah `.env`: `REFRESH_TOKEN_TTL_DAYS=0`, restart, login, lalu refresh. **Diharapkan:** `401` (audit `refresh_token_expired`). Kembalikan ke `1` dan restart.

---

## 11. Ringkasan Cakupan terhadap Skenario SPEC

| Skenario SPEC | Request di dokumen ini |
|---------------|------------------------|
| 1 Login sukses | A1 |
| 2 Device tidak terdaftar | A2 |
| 3 Password salah | A4 |
| 4 Tanpa token | N2 |
| 5 Token kedaluwarsa / signature salah | M1, N3, M4 |
| 6 Device milik user lain | N4 |
| 7 mhs1 `GET /nilai` | N1 |
| 8 mhs1 NIM orang lain | T2 |
| 9 mhs1 NIM sendiri | T1 |
| 10 admin semua NIM | T3 |
| 11 admin `/nilai` | N10 |
| 12 dosen kelas lain | N8 |
| 13 dosen ubah nilai draft | N11 |
| 14 dosen ubah nilai kelas lain | N12 |
| 15 di luar jam akses | M2 |
| 16 finalisasi | K1 |
| 17 ubah setelah final | K5 |
| 18 token user ke `/transkrip/sinkron` | T6 |
| 19 akses langsung tanpa secret | S1, S5 |
| 20 akses langsung + secret tanpa token | S2 |
| 21 gateway secret palsu | N16 |
| 22 rotasi refresh token | A9, A10 |
| 23 logout lalu refresh | A13, A14 |
| 24 service transkrip mati | M3 |
| 25 audit log | Bagian 9 |

---

## 12. Tips Postman

- Gunakan **Collection Runner** untuk menjalankan semua request berurutan; pastikan urutan login sebelum request ber-token.
- Simpan token di **Environment**, bukan hardcode di setiap request.
- Aktifkan **"Automatically follow redirects"** (default) dan matikan **SSL certificate verification** hanya jika memakai HTTPS lokal (tidak perlu untuk HTTP 127.0.0.1).
- Setelah `npm run seed`, token lama di database terhapus, jadi **login ulang** sebelum menguji.
- Koleksi siap pakai juga tersedia di `postman/sistem-nilai.postman_collection.json` (impor lewat **Import → File**), lalu lengkapi variabel environment seperti bagian 1.
