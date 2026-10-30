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

### A10 — Refresh memakai refresh token lama (setelah rotasi)

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/refresh`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:** gunakan refresh token **lama** (sebelum A9).
- **Diharapkan:** `401 Unauthorized`.
- **Audit:** `deny` / `refresh_token_revoked`.

---

### A13 — Logout

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/logout`
- **Headers:** `Content-Type: application/json`, `X-Device-ID: DEV-MHS-01`
- **Body:** `{"refresh_token":"{{refresh_token}}"}`
- **Diharapkan:** `200 OK`, `{"message":"Logout berhasil."}`.
- **Audit:** `allow` / `logout_success`.

### A14 — Logout lalu refresh dengan token tersebut

Lakukan A13, lalu ulangi A9 dengan refresh token yang sama.

- **Diharapkan:** `401 Unauthorized`.
- **Audit:** `deny` / `refresh_token_revoked`.

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


### N10 — admin lihat `/nilai` (ditolak)

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:** `Authorization: Bearer {{admin_token}}`, `X-Device-ID: DEV-ADMIN-01`
- **Diharapkan:** `403 Forbidden`, `{"error":"role_not_allowed"}`.

---

### N8 — dosen1 lihat kelas dosen2

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai?kelas_id=2`
- **Headers:** `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Diharapkan:** `403 Forbidden`, `{"error":"class_not_taught"}`.

---

### T6 — Sinkronisasi memakai token user (ditolak)

- **Method:** `POST`
- **URL:** `{{base_url}}/transkrip/sinkron`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {{dosen1_token}}`
  - `X-Device-ID: DEV-DOSEN-01`
- **Body:** sama seperti T5.
{
  "kelas_id": 1,
  "kode_mk": "KI-A",
  "nama_mk": "Keamanan Informasi A",
  "entries": [
    { "nim": "2210001", "nilai_angka": 85, "nilai_huruf": "A" },
    { "nim": "2210002", "nilai_angka": 72.5, "nilai_huruf": "B" }
  ]
}
- **Diharapkan:** `403 Forbidden`, `{"error":"service_token_required"}`.

---

### N4 — Token valid tetapi device milik user lain

- **Method:** `GET`
- **URL:** `{{base_url}}/nilai`
- **Headers:**
  - `Authorization: Bearer {{mhs1_token}}`
  - `X-Device-ID: DEV-MHS-02` *(device milik mhs2)*
- **Diharapkan:** `403 Forbidden`, `device_not_registered`.

---

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


### T1 — mhs1 lihat transkrip NIM sendiri

- **Method:** `GET`
- **URL:** `{{base_url}}/transkrip/2210001`
- **Headers:** `Authorization: Bearer {{mhs1_token}}`, `X-Device-ID: DEV-MHS-01`
- **Diharapkan:** `200 OK`, `{"data":[...]}` (kosong sebelum finalisasi, terisi setelah K1).
- **Audit:** `allow` / `own_transcript`.

---

### K5 — ubah nilai setelah final

Jalankan **setelah K1**.

- **Method:** `PUT`
- **URL:** `{{base_url}}/nilai/1`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer {{dosen1_token}}`, `X-Device-ID: DEV-DOSEN-01`
- **Body:** `{"nilai_angka":95}`
- **Diharapkan:** `403 Forbidden`, `{"error":"grade_already_final"}`.

---

## 9. Audit Log

```sql
SELECT waktu, subject_type, subject_id, endpoint, device_id, hasil, alasan
FROM sistem_nilai.audit_log
ORDER BY waktu DESC
LIMIT 50;
```