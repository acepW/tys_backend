# Panduan Frontend: Leave Request (Perizinan)

Leave request dipakai karyawan untuk mengajukan izin (misalnya sakit atau keperluan pribadi). Request harus disetujui berurutan oleh atasan, HR, SPV HR, Manager HR, lalu Direktur. Semua endpoint berawalan `/api/leave-requests` dan memakai cookie login yang sama seperti endpoint lain.

## Konsep singkat

### Alur status

```
request supervisor → request hr → request spv hr → request manager hr → request director → approved
```

Khusus **sick leave** yang SKD-nya belum terlampir saat approval HR:

```
... → request director → request verification hr → approved
```

| Status               | Arti                                  | Tombol yang tampil                        |
| -------------------- | ------------------------------------- | ----------------------------------------- |
| `request supervisor` | Menunggu atasan                       | Edit (pembuat), Approve / Reject (Atasan) |
| `request hr`         | Menunggu HR                           | Approve / Reject (HR)                     |
| `request spv hr`     | Menunggu SPV HR                       | Approve / Reject (SPV HR)                 |
| `request manager hr` | Menunggu Manager HR                   | Approve / Reject (Manager HR)             |
| `request director`   | Menunggu Direktur                     | Approve / Reject (Direktur)               |
| `request verification hr` | Sick leave tanpa SKD: menunggu Admin/SPV HR melampirkan surat keterangan dokter | Verify + upload SKD (Admin/SPV HR) |
| `approved`           | Disetujui semua tahap                 | Tidak ada                                 |
| `rejected supervisor`, `rejected hr`, `rejected spv hr`, `rejected manager hr`, `rejected director` | Ditolak di tahap tersebut | Tidak ada |

`approved` dan semua `rejected ...` adalah status akhir. Reject di tahap mana pun langsung menghentikan request. Step `request verification hr` tidak punya reject.

### Sick leave dan SKD

Request dianggap **sick leave** jika `type` mengandung kata `sick` (huruf besar/kecil tidak berpengaruh), misalnya `Sick` atau `Sick Leave`.

- Saat **HR approve** sick leave, HR wajib memilih `sick_letter_status`: `attached` (sudah terlampir SKD) atau `not attached` (belum terlampir SKD). Untuk type lain field ini diabaikan.
- Jika `not attached`, setelah Direktur approve status menjadi `request verification hr`. Admin/SPV HR lalu melampirkan SKD lewat endpoint verify, dan status menjadi `approved`.
- Jika `attached`, alurnya sama seperti biasa: Direktur approve → `approved`.
- `sick_letter_status` ada di response list/detail. Setelah verify nilainya menjadi `attached`.

> **Penting:** fitur ini **belum terhubung ke approval flow**, jadi response belum membawa `is_can_approve_reject` / `action_label`. Backend hanya mengecek urutan status, bukan siapa yang menekan tombol. **Frontend yang perlu menampilkan tombol Approve/Reject hanya ke role yang sesuai** dengan status saat ini (lihat tabel di atas).

### Verification progress

`verification_progress` adalah riwayat aksi untuk ditampilkan sebagai timeline. Isinya **aksi yang dilakukan**, bukan status berikutnya:

| `status` di progress  | Kapan                       |
| --------------------- | --------------------------- |
| `created`             | Request dibuat              |
| `edited`              | Request diedit pembuat      |
| `approved supervisor` / `approved hr` / `approved spv hr` / `approved manager hr` / `approved director` | Tahap tersebut approve |
| `rejected supervisor` / `rejected hr` / `rejected spv hr` / `rejected manager hr` / `rejected director` | Tahap tersebut reject (alasan ada di `note`) |
| `verified hr`         | Admin/SPV HR melampirkan SKD |

## Endpoint

| Aksi              | Method & endpoint                                  | Keterangan                                        |
| ----------------- | -------------------------------------------------- | ------------------------------------------------- |
| List              | `GET /api/leave-requests`                          | Filter: `id_employee`, `id_department`, `status`, `type`, `search` (cari di `reason`), `page`, `limit` |
| Detail            | `GET /api/leave-requests/:id`                      |                                                   |
| Buat              | `POST /api/leave-requests`                         |                                                   |
| Edit              | `PUT /api/leave-requests/:id`                      | Hanya pembuat, hanya saat `request supervisor`    |
| Approve / Reject  | `PATCH /api/leave-requests/{tahap}/approve/:id`, `PATCH /api/leave-requests/{tahap}/reject/:id` | `{tahap}` lihat tabel di bawah |
| Verify SKD        | `PATCH /api/leave-requests/verification-hr/verify/:id` | Hanya saat `request verification hr`, lihat bagian 5b |

| Status saat ini      | `{tahap}` di URL |
| -------------------- | ---------------- |
| `request supervisor` | `supervisor`     |
| `request hr`         | `hr`             |
| `request spv hr`     | `spv-hr`         |
| `request manager hr` | `manager-hr`     |
| `request director`   | `director`       |

Contoh: request berstatus `request spv hr` di-approve lewat `PATCH /api/leave-requests/spv-hr/approve/12`.

## 1. Form buat request

`POST /api/leave-requests`

```json
{
  "id_employee": 3,
  "type": "Sick",
  "start_date": "2026-10-14",
  "end_date": "2026-10-16",
  "duration": 3,
  "reason": "Demam tinggi, disarankan istirahat oleh dokter",
  "health_facility_name": "Klinik Sehat Sentosa",
  "clinic_phone": "021-5551234",
  "clinic_address": "Jl. Merdeka No. 10, Jakarta",
  "doctor_name": "dr. Andi Wijaya",
  "files_attachment": [
    {
      "original_name": "surat-dokter.pdf",
      "stored_name": "1760400000000-surat-dokter.pdf",
      "url": "/uploads/leave/1760400000000-surat-dokter.pdf",
      "mime_type": "application/pdf",
      "size": 204800
    }
  ]
}
```

| Field                  | Wajib | Label di form              | Keterangan                                                    |
| ---------------------- | ----- | -------------------------- | ------------------------------------------------------------- |
| `id_employee`          | Ya    | Karyawan                   | ID dari `/api/employees`                                      |
| `type`                 | Ya    | Jenis Izin                 | Teks bebas, maks. 100 karakter, misalnya `Sick`, `Personal`   |
| `start_date`           | Ya    | Tanggal Mulai              | Format `YYYY-MM-DD`                                           |
| `end_date`             | Ya    | Tanggal Selesai            | Format `YYYY-MM-DD`, tidak boleh sebelum `start_date`         |
| `duration`             | Tidak | Durasi (hari)              | Angka > 0, boleh desimal (`0.5`). Jika kosong, dihitung otomatis dari tanggal (inklusif): 14–16 Okt = 3 |
| `reason`               | Ya    | Alasan                     |                                                               |
| `health_facility_name` | Tidak | Nama Fasilitas Kesehatan   | Maks. 255 karakter                                            |
| `clinic_phone`         | Tidak | No. Telp Klinik            | **String**, maks. 50 karakter (jangan kirim sebagai angka)    |
| `clinic_address`       | Tidak | Alamat Klinik              |                                                               |
| `doctor_name`          | Tidak | Nama Dokter                | Maks. 255 karakter                                            |
| `files_attachment`     | Tidak | Lampiran (surat dokter, dll.) | Bisa lebih dari satu file. Upload dulu lewat `/api/uploads/...`, lalu kirim metadata hasil upload |

Tips form:

- Data klinik dan dokter biasanya hanya relevan untuk izin sakit. Frontend boleh menyembunyikan field tersebut untuk jenis izin lain. Backend tidak mewajibkannya.
- Hitung dan tampilkan durasi otomatis saat tanggal dipilih. Kirim `duration` hanya jika user mengubahnya, misalnya setengah hari.

Response sukses (`201`) berisi detail request seperti di bagian 2.

## 2. List dan detail

`GET /api/leave-requests?status=request%20hr&page=1&limit=10`

```json
{
  "success": true,
  "code": 200,
  "message": "Leave requests retrieved successfully",
  "pagination": { "total_data": 1, "total_page": 1, "current_page": 1, "per_page": 10 },
  "data": [
    {
      "id": 12,
      "id_employee": 3,
      "id_department": 4,
      "id_user_request": 5,
      "type": "Sick",
      "start_date": "2026-10-14",
      "end_date": "2026-10-16",
      "duration": "3.0",
      "reason": "Demam tinggi, disarankan istirahat oleh dokter",
      "health_facility_name": "Klinik Sehat Sentosa",
      "clinic_phone": "021-5551234",
      "clinic_address": "Jl. Merdeka No. 10, Jakarta",
      "doctor_name": "dr. Andi Wijaya",
      "status": "request hr",
      "is_active": true,
      "createdAt": "2026-10-14T02:00:00.000Z",
      "updatedAt": "2026-10-14T03:00:00.000Z",
      "employee": { "id": 3, "employee_code": "EMP-003", "full_name": "Budi Santoso" },
      "department": { "id": 4, "department_name": "Operations" },
      "user_request": { "id": 5, "name": "Budi", "email": "budi@example.com" },
      "files_attachment": [
        {
          "id": 41,
          "original_name": "surat-dokter.pdf",
          "url": "/uploads/leave/1760400000000-surat-dokter.pdf",
          "mime_type": "application/pdf",
          "size": 204800
        }
      ],
      "verification_progress": [
        { "status": "created", "note": "Leave request created", "createdAt": "2026-10-14T02:00:00.000Z", "user": { "id": 5, "name": "Budi" } },
        { "status": "approved supervisor", "note": null, "createdAt": "2026-10-14T03:00:00.000Z", "user": { "id": 7, "name": "Sari" } }
      ]
    }
  ]
}
```

Tanpa `page` dan `limit`, `data` berisi semua request tanpa `pagination`.

Catatan field:

- `duration` dikirim sebagai string desimal (`"3.0"`). Ubah ke angka sebelum ditampilkan.
- `start_date` dan `end_date` berformat `YYYY-MM-DD` tanpa jam.
- Isi objek `department` mengikuti tabel department. Contoh di atas hanya ilustrasi.

## 3. Aturan tombol

| Kondisi                                                                  | Tampilkan                         |
| ------------------------------------------------------------------------ | --------------------------------- |
| `status === "request supervisor"` dan user login = pembuat (`id_user_request`) | Tombol **Edit**             |
| `status` diawali `request ` (selain `request verification hr`) dan role user sesuai tahap (lihat tabel Konsep singkat) | Tombol **Approve** dan **Reject** |
| `status === "request hr"` dan `type` mengandung `sick` | Di form approve HR, tampilkan pilihan **Sudah terlampir SKD** (`attached`) / **Belum terlampir SKD** (`not attached`), wajib dipilih |
| `status === "request verification hr"` dan role Admin/SPV HR | Tombol **Verify** dengan upload SKD |
| `status === "approved"` atau diawali `rejected `                         | Tanpa tombol                      |

Untuk badge "Menunggu ...", ambil nama tahap dari status, misalnya `request spv hr` → "Menunggu SPV HR".

## 4. Edit request

`PUT /api/leave-requests/:id`

Kirim **hanya field yang diubah**. Field yang tidak dikirim tetap seperti semula.

```json
{
  "end_date": "2026-10-17",
  "reason": "Demam belum turun, istirahat diperpanjang 1 hari",
  "files_attachment": [
    { "id": 41 },
    {
      "original_name": "surat-dokter-perpanjangan.pdf",
      "stored_name": "1760500000000-surat-dokter-perpanjangan.pdf",
      "url": "/uploads/leave/1760500000000-surat-dokter-perpanjangan.pdf",
      "mime_type": "application/pdf",
      "size": 180000
    }
  ]
}
```

- Jika `start_date` atau `end_date` diubah tanpa mengirim `duration`, durasi dihitung ulang otomatis (contoh di atas menjadi 4).
- `files_attachment`: jika array dikirim, isinya **menggantikan** daftar lama. Sertakan `{ "id": ... }` untuk file lama yang ingin dipertahankan; file lama yang tidak disertakan akan dihapus. Jika `files_attachment` tidak dikirim, file tidak berubah.
- `status` dan `id_user_request` tidak bisa diubah lewat endpoint ini.

## 5. Approve dan reject

Approve (`note` opsional):

```http
PATCH /api/leave-requests/supervisor/approve/12
```

```json
{ "note": "Disetujui" }
```

Reject (`note` **wajib**, tampilkan modal input alasan):

```http
PATCH /api/leave-requests/hr/reject/12
```

```json
{ "note": "Surat dokter tidak terbaca, mohon ajukan ulang" }
```

Approve HR untuk sick leave (`sick_letter_status` **wajib**):

```http
PATCH /api/leave-requests/hr/approve/12
```

```json
{ "sick_letter_status": "not attached", "note": "SKD menyusul" }
```

Keduanya mengembalikan detail request terbaru. Request yang ditolak tidak bisa diedit atau dibuka lagi; karyawan perlu membuat request baru.

## 5b. Verify SKD (Admin/SPV HR)

```http
PATCH /api/leave-requests/verification-hr/verify/12
```

```json
{
  "note": "SKD diterima (opsional)",
  "files_attachment": [
    {
      "original_name": "skd-budi.pdf",
      "stored_name": "1760600000000-skd-budi.pdf",
      "url": "/uploads/leave/1760600000000-skd-budi.pdf",
      "mime_type": "application/pdf",
      "size": 150000
    }
  ]
}
```

- `files_attachment` wajib berisi minimal satu file baru (SKD). Upload dulu lewat endpoint upload, lalu kirim hasilnya.
- File **ditambahkan** ke `files_attachment` yang sudah ada; lampiran sebelumnya tidak dihapus. Jadi kirim file baru saja, tidak perlu menyertakan `id` file lama.
- Status menjadi `approved` dan `sick_letter_status` menjadi `attached`.

## 6. Pesan error yang perlu ditangani

| HTTP | Pesan                                                         | Kapan                                                   |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------- |
| 400  | `id_employee must be a positive integer`, `type is required`, `reason is required` | Validasi form             |
| 400  | `start_date must use YYYY-MM-DD format`, `end_date must use YYYY-MM-DD format` | Format tanggal salah         |
| 400  | `end_date must not be before start_date`                      | Tanggal selesai sebelum tanggal mulai                   |
| 400  | `duration must be a positive number`                          | Durasi 0, negatif, atau bukan angka                     |
| 400  | `type must not exceed 100 characters`, `<field> must not exceed <n> characters`, `<field> must be a string` | Field teks tidak valid |
| 400  | `files_attachment must be an array`                           | `files_attachment` bukan array                          |
| 400  | `Employee <id> not found`                                     | `id_employee` tidak ada                                 |
| 400  | `note is required for rejection`                              | Reject tanpa note                                       |
| 400  | `sick_letter_status must be one of: attached, not attached`  | HR approve sick leave tanpa memilih status SKD          |
| 400  | `files_attachment must contain the doctor's letter (SKD)`, `files_attachment[i] must have original_name, stored_name and url` | Verify tanpa file SKD |
| 403  | `Only the creator can edit this leave request`                | Edit oleh user selain pembuat                           |
| 404  | `Leave request not found`                                     | ID tidak ada                                            |
| 409  | `Only leave requests awaiting the supervisor can be edited`   | Edit setelah atasan memproses                           |
| 409  | `Action is not allowed from status "<status>"`                | Approve/reject di tahap yang salah, atau request sudah selesai |

Pesan error ada di field `message` pada response.
