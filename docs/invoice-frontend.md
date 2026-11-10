# Panduan Frontend: Invoice (Approval, Pembayaran, Faktur Pajak, Revisi, Bukti Potong)

Invoice penjualan dibuat AR & AP dari pembayaran contract/PO yang sudah dibuka (incoming), di-submit, lalu di-approve SPV FAT Internal (tanpa upload file). Setelah itu Sales bisa meminta Faktur Pajak (FP), meminta revisi tax, atau meng-upload bukti bayar dari klien yang kemudian diverifikasi AR & AP sampai invoice lunas. Invoice yang dipotong PPh 23 / PPh 4(2) baru selesai (`paid & clear`) setelah bukti potongnya diterima AR & AP. Semua endpoint berawalan `/api/invoices` dan memakai cookie login yang sama seperti endpoint lain.

Alur ini mengikuti dokumen kebutuhan "Kebutuhan Sistem - FAT Internal". Progres per poin dokumen ada di [invoice-approval-fat.md](invoice-approval-fat.md).

## Konsep singkat

### Alur status invoice (`status`)

```text
pending ─submit─► on verification ─approve──────────────► waiting for payment ◄──────────────────┐
                         └─reject─► rejected / cancelled       │          │                       │ belum lunas
                                                               │          │ Sales upload bukti bayar
                                                               │          ▼                       │
                                                               │   payment verification ─terima───┤
                                                               │          │ tolak                 │ lunas
                                                               │          ▼                       ▼
                                                               │   payment proof rejected        lunas: ada PPh 23 / PPh 4(2)? ─tidak─► paid & clear
                                                               │     (Sales upload ulang)          │ ya
                                                               │                                   ▼
                                                               │                        paid waiting wht ─Sales upload bukti potong─► wht verification
                                                               │                        (AR & AP tolak ─► wht rejected ─Sales upload ulang─► wht verification)
                                                               │                        (AR & AP terima semua bukti potong ─► paid & clear)
                                                               │
                                                               └─ Sales minta revisi ─► revision requested ─AR & AP revisi PPh─► waiting for revision
                                                                  (AR & AP tolak permintaan ─► waiting for payment)     (SPV tolak ─► revision requested)
                                                                                                                        (SPV approve ─► waiting for payment)
```

| Status                   | Arti                                                     | Siapa yang beraksi | Tombol yang tampil                 |
| ------------------------ | -------------------------------------------------------- | ------------------ | ---------------------------------- |
| `pending`                | Draft invoice dibuat AR & AP                             | AR & AP            | Edit, Submit                       |
| `on verification`        | Menunggu SPV FAT Internal / Manager                      | SPV FAT Internal   | Approve, Reject                    |
| `waiting for payment`    | Invoice bisa di-download Sales, menunggu klien membayar  | Sales              | Upload Bukti Bayar, Minta Revisi   |
| `payment verification`   | Bukti bayar sedang dicek AR & AP                         | AR & AP            | Terima, Tolak                      |
| `payment proof rejected` | Bukti bayar ditolak AR & AP (alasan di riwayat)          | Sales              | Upload Ulang Bukti Bayar           |
| `revision requested`     | Sales minta revisi tax, menunggu AR & AP                 | AR & AP            | Revisi PPh, Tolak Permintaan       |
| `waiting for revision`   | Hasil revisi menunggu SPV FAT Internal                   | SPV FAT Internal   | Approve Revisi, Reject Revisi      |
| `paid waiting wht`       | Lunas, menunggu bukti potong PPh dari klien              | Sales              | Upload Bukti Potong                |
| `wht verification`       | Bukti potong sedang dicek AR & AP                        | AR & AP            | Terima, Tolak (per bukti potong)   |
| `wht rejected`           | Bukti potong ditolak AR & AP (alasan dan screenshot di riwayat) | Sales       | Upload Ulang Bukti Potong          |
| `paid & clear`           | Lunas dan bukti potong (kalau ada) sudah diterima        | -                  | Tidak ada                          |
| `rejected`               | Ditolak SPV karena salah PPh/PPN, kembali ke AR & AP     | AR & AP            | Edit, Submit (ulang)               |
| `cancelled`              | Ditolak SPV karena CT/PO di-addendum/batal/revisi        | -                  | Tidak ada                          |

- `paid & clear` dan `cancelled` adalah status akhir. Status `paid` sudah tidak dipakai; invoice lama yang `paid` dipindahkan ke `paid & clear`.
- SPV memilih jenis reject (`reject_type`): `tax` → `rejected`, AR & AP memperbaiki lalu submit ulang ke `on verification`; `ct/po cancelled` → `cancelled`, Sales membuat request invoice baru dari CT/PO yang sudah diubah. Lihat bagian 5.
- Tombol **Request Faktur Pajak** tidak tergantung status di atas. Lihat bagian berikut.

### Final Invoice dan Faktur Pajak (`tax_invoice_status`)

Saat SPV approve, invoice masih **Proforma** (`is_final === false`). AR & AP menerbitkan **Final Invoice** (`file_final_invoice`) bersama Faktur Pajak (FP). Keduanya punya status sendiri di kolom `tax_invoice_status`, terpisah dari `status`, karena bisa berjalan bersamaan dengan pembayaran. Nomor invoice tidak berubah.

```text
none ─Sales request FP (1x) / bukti bayar pertama diterima─► requested ─AR & AP upload Final Invoice + FP─► issued (is_final = true)
```

| `tax_invoice_status` | Arti                                              | Tombol yang tampil              |
| -------------------- | ------------------------------------------------- | ------------------------------- |
| `none`               | Final Invoice dan FP belum diminta                | Request Faktur Pajak (Sales)    |
| `requested`          | Menunggu AR & AP meng-upload Final Invoice (dan FP) | Upload Final Invoice & Faktur Pajak (AR & AP) |
| `issued`             | Final Invoice (dan FP) sudah terbit, bisa di-download | Download Final Invoice / Faktur Pajak |

- **Hanya invoice dengan PPN** (`tax_ppn === true`) yang butuh FP. Invoice tanpa PPN tetap butuh Final Invoice, tetapi tidak bisa di-request Sales (tombol Request FP disembunyikan).
- Sales bisa request FP **satu kali**, kapan pun setelah invoice di-approve SPV (termasuk saat bukti bayar sedang dicek), selama `tax_invoice_status === "none"`. Final Invoice ikut diterbitkan saat itu, walaupun belum ada pembayaran.
- Kalau belum di-request, `tax_invoice_status` otomatis menjadi `requested` saat bukti bayar pertama **diterima** AR & AP. Ini berlaku untuk invoice ber-PPN (Final Invoice + FP) maupun tanpa PPN (Final Invoice saja).
- Mengubah `status` tidak mengubah `tax_invoice_status`, dan sebaliknya.
- Pengecualian (sejak 2026-11-10): kalau SPV meng-approve revisi PPh pada invoice yang sudah Final, `tax_invoice_status` kembali menjadi `requested` sementara `is_final` tetap `true`, karena total pada file Final Invoice sudah berubah. AR & AP meng-upload ulang Final Invoice; FP tetap berlaku. Selama masa ini tombol yang tampil adalah Upload, bukan Download.

### Bayar sebagian

Satu invoice boleh dibayar beberapa kali. Setiap bukti bayar diverifikasi satu per satu:

- Kalau bukti bayar **diterima** dan totalnya **belum** menutup tagihan, invoice kembali ke `waiting for payment` supaya Sales bisa upload pembayaran berikutnya.
- Kalau totalnya **sudah** menutup tagihan, invoice menjadi `paid waiting wht` (ada PPh 23 / PPh 4(2), lihat bagian 10) atau `paid & clear`.
- Kalau bukti bayar **ditolak**, invoice menjadi `payment proof rejected`. Bukti yang ditolak tetap tersimpan sebagai riwayat. Upload ulang membuat baris baru.

Angka yang dipakai:

| Field            | Isi                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| `total`          | Total tagihan, sudah dikurangi PPh (`sub_total + ppn − pph − pp_20 − pph_4_ayat_2`) |
| `payment_amount` | Jumlah semua bukti bayar yang sudah **diterima**                    |
| Sisa tagihan     | `total − payment_amount` (hitung di frontend)                       |

Semua angka uang dikirim backend sebagai **string** (`"10000000"`). Ubah ke angka sebelum dihitung atau diformat.

### Revisi tax

Revisi dipakai kalau ada perubahan PPh yang baru diinfokan klien. Aturannya:

- Hanya bisa diminta saat `waiting for payment` dan **belum ada bukti bayar yang diterima** (`payment_amount` kosong atau 0).
- Sales wajib mengisi alasan dan melampirkan bukti chat klien.
- AR & AP hanya bisa mengubah **PPh** (`tax_pph_23`, `tax_pp_20`, `tax_pph_4_ayat_2`). PPN tidak berubah, jadi nomor invoice dan FP tetap sama. `pph`, `pp_20`, `pph_4_ayat_2`, dan `total` dihitung ulang oleh backend.

### Tombol mana yang tampil: flag dari backend

Setiap invoice di response list dan detail membawa:

| Field                       | Isi                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `is_can_approve_reject`     | `true` kalau user login boleh melakukan aksi di `status` invoice saat ini (submit, approve, upload bukti bayar, verifikasi, revisi, dst.) |
| `action_label`              | Aksi yang ditunggu di `status` itu, misalnya `Upload Payment Proof Invoice`. `null` kalau tidak menunggu aksi |
| `is_can_upload_tax_invoice` | `true` kalau user login boleh meng-upload Final Invoice dan FP (`tax_invoice_status === "requested"`) |
| `tax_invoice_action_label`  | `Upload Final Invoice & Tax Invoice (FP)` saat diminta, selain itu `null`                     |

**Tampilkan tombol aksi hanya kalau flag-nya `true`**, lalu pilih tombolnya berdasarkan status (lihat bagian 3). Siapa yang boleh beraksi diatur admin di approval flow, jadi frontend tidak perlu mengecek role sendiri.

> Untuk sementara semua aksi invoice di-set ke posisi **Developer** (untuk testing). Login dengan user posisi lain akan mendapat flag `false`.

Tombol **Request Faktur Pajak** dan **Minta Revisi** memakai `is_can_approve_reject` saat `status === "waiting for payment"`. Saat status lain (misalnya `payment verification`), tombol Request FP boleh tetap ditampilkan untuk Sales selama `tax_invoice_status === "none"`. Backend mengecek bahwa user adalah Sales.

### Verification progress

`verification_progress` adalah riwayat aksi untuk timeline. Isinya **aksi yang dilakukan**, bukan status berikutnya:

| `status` di progress        | Kapan                                                    |
| --------------------------- | -------------------------------------------------------- |
| `created`                   | Invoice dibuat                                           |
| `submitted`                 | AR & AP submit                                           |
| `approved`                  | SPV approve (invoice langsung `waiting for payment`)     |
| `rejected`                  | SPV reject karena pajak, kembali ke AR & AP (alasan di `note`) |
| `cancelled`                 | SPV reject karena CT/PO berubah, invoice batal (alasan di `note`) |
| `payment uploaded`          | Sales upload bukti bayar                                 |
| `payment accepted`          | AR & AP menerima bukti bayar                             |
| `payment rejected`          | AR & AP menolak bukti bayar (alasan di `note`)           |
| `tax invoice requested`     | FP diminta Sales, atau otomatis setelah bukti bayar diterima |
| `tax invoice issued`        | AR & AP meng-upload Final Invoice + FP                   |
| `final invoice requested`   | Final Invoice otomatis diminta setelah bukti bayar diterima (invoice tanpa PPN) |
| `final invoice issued`      | AR & AP meng-upload Final Invoice (invoice tanpa PPN)    |
| `revision requested`        | Sales minta revisi (alasan di `note`, bukti chat di `revision_attachment`) |
| `revision request rejected` | AR & AP menolak permintaan revisi (alasan di `note`)     |
| `revised`                   | AR & AP merevisi PPh                                     |
| `revision approved`         | SPV approve revisi                                       |
| `revision rejected`         | SPV menolak revisi, kembali ke AR & AP (alasan di `note`) |

Invoice lama bisa masih punya progress `signing`, `waiting for payment`, atau `paid` dari alur sebelumnya. Tampilkan apa adanya.

Riwayat untuk bukti potong:

| `status` di progress | Kapan                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `wht uploaded`       | Sales upload bukti potong                                                                     |
| `wht accepted`       | AR & AP menerima bukti potong                                                                 |
| `wht rejected`       | AR & AP menolak bukti potong (alasan di `note`, diawali jenis PPh; screenshot di `wht_reject_attachment`) |
| `paid & clear`       | Invoice selesai: lunas tanpa bukti potong, atau semua bukti potong sudah diterima             |

## Endpoint

| Aksi                       | Method & endpoint                                 | Syarat                                         |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| List                       | `GET /api/invoices`                               | Filter: `status`, `id_company`, `id_customer`, `id_contract`, `id_pre_order`, `id_quotation`, `source_type`, `search`, `page`, `limit` |
| Detail                     | `GET /api/invoices/:id`                           |                                                |
| Daftar incoming            | `GET /api/invoices/incoming`                      | Query: `status` (`incoming`/`history`), `source_type` (`all`/`contract`/`pre_order`), `search`, `page`, `limit` |
| Nomor invoice berikutnya   | `GET /api/invoices/no/documents`                  |                                                |
| Buat dari incoming         | `POST /api/invoices/from-incoming`                |                                                |
| Edit draft                 | `PUT /api/invoices/:id`                           | `status` = `pending` / `rejected`              |
| Submit                     | `PATCH /api/invoices/submit/:id`                  | `status` = `pending` / `rejected`              |
| Approve                    | `PATCH /api/invoices/approve/:id`                 | `status` = `on verification`                   |
| Reject                     | `PATCH /api/invoices/reject/:id`                  | `status` = `on verification`                   |
| Upload bukti bayar         | `PATCH /api/invoices/upload-payment/:id`          | `status` = `waiting for payment` / `payment proof rejected` |
| Terima bukti bayar         | `PATCH /api/invoices/payment-accept/:id`          | `status` = `payment verification`              |
| Tolak bukti bayar          | `PATCH /api/invoices/payment-reject/:id`          | `status` = `payment verification`              |
| Request faktur pajak       | `PATCH /api/invoices/tax-invoice-request/:id`     | `tax_ppn`, `tax_invoice_status` = `none`, sudah di-approve SPV |
| Upload Final Invoice + FP  | `PATCH /api/invoices/tax-invoice/:id`             | `tax_invoice_status` = `requested`             |
| Minta revisi               | `PATCH /api/invoices/revision-request/:id`        | `status` = `waiting for payment`, belum ada pembayaran diterima |
| Tolak permintaan revisi    | `PATCH /api/invoices/revision-request-reject/:id` | `status` = `revision requested`                |
| Revisi PPh                 | `PATCH /api/invoices/revise/:id`                  | `status` = `revision requested`                |
| Approve revisi             | `PATCH /api/invoices/revision-approve/:id`        | `status` = `waiting for revision`              |
| Reject revisi              | `PATCH /api/invoices/revision-reject/:id`         | `status` = `waiting for revision`              |
| Upload bukti potong        | `PATCH /api/invoices/:id/withholding-taxes/:whtId/upload` | Bukti potong `waiting` / `rejected`, invoice `paid waiting wht` / `wht verification` / `wht rejected` |
| Terima bukti potong        | `PATCH /api/invoices/:id/withholding-taxes/:whtId/accept` | Bukti potong `verification`              |
| Tolak bukti potong         | `PATCH /api/invoices/:id/withholding-taxes/:whtId/reject` | Bukti potong `verification`              |

Semua aksi `PATCH` mengembalikan detail invoice terbaru (bentuknya sama dengan `GET /api/invoices/:id`), jadi halaman detail bisa langsung di-refresh dari response.

### Upload file

File di-upload dulu, lalu metadata hasilnya dikirim ke endpoint invoice.

| Endpoint                               | Form-data key     | Response `data`        |
| -------------------------------------- | ----------------- | ---------------------- |
| `POST /api/uploads/invoice/single`     | `file`            | Satu objek file        |
| `POST /api/uploads/invoice/multiple`   | `files` (maks. 5) | Array objek file       |

```json
{
  "success": true,
  "data": {
    "url": "/files/invoice/1761700000000-bukti-transfer.pdf",
    "mime_type": "application/pdf",
    "size": 120345,
    "original_name": "bukti-transfer.pdf",
    "stored_name": "1761700000000-bukti-transfer.pdf"
  }
}
```

Untuk field berbentuk **array file** (`payment_proof`, `tax_invoice_attachment`, `file_final_invoice`, `revision_attachment`, `withholding_tax_receipt`, `wht_reject_attachment`), kirim objek ini apa adanya.

## 1. Buat dan edit invoice (AR & AP)

1. Tampilkan daftar dari `GET /api/invoices/incoming?status=incoming`.
2. Ambil nomor dari `GET /api/invoices/no/documents`.
3. Kirim `POST /api/invoices/from-incoming`:

```json
{
  "incoming_invoice_ids": [12, 13],
  "invoice_no": "INV-TYSCG-2026-0005",
  "date": "2026-10-29",
  "due_date": "2026-11-29",
  "tax_ppn": true,
  "tax_pph_23": true,
  "tax_pp_20": false,
  "tax_pph_4_ayat_2": false,
  "note": "Termin 1"
}
```

| Field                      | Wajib | Keterangan                                                         |
| -------------------------- | ----- | ------------------------------------------------------------------ |
| `incoming_invoice_ids`     | Ya    | ID dari daftar incoming. Semua harus dari satu pembayaran yang sama |
| `invoice_no`               | Ya    |                                                                    |
| `date`                     | Ya    |                                                                    |
| `due_date`                 | Tidak |                                                                    |
| `tax_ppn`, `tax_pph_23`, `tax_pp_20`, `tax_pph_4_ayat_2` | Tidak | Boolean. Halaman 1 di dokumen FAT: cek tax  |
| `note`                     | Tidak |                                                                    |
| `incoming_debit_note_ids`  | Tidak | Halaman 2 di dokumen FAT: debit note. Kalau diisi, `debit_note_data.debit_note_no` wajib |
| `debit_note_data`          | Tidak | `{ "debit_note_no": "...", "date": "...", "note": "..." }`        |

Hasil: invoice berstatus `pending`.

`PUT /api/invoices/:id` hanya bisa selama `pending`, atau `rejected` (ditolak SPV karena pajak). Setelah di-approve, perubahan tax harus lewat revisi (bagian 9). Field `status`, `tax_invoice_status`, `reject_type`, `is_final`, `final_at`, dan `file_final_invoice` di body `PUT` diabaikan.

## 2. List dan detail

`proforma_invoice_no` adalah `invoice_no` dengan awalan `PRO-`. Nilainya dihitung otomatis di response dan selalu mengikuti `invoice_no`, jadi tidak perlu dikirim saat create atau update.

`GET /api/invoices/:id` (potongan field yang relevan untuk alur ini):

```json
{
  "success": true,
  "code": 200,
  "message": "Invoice retrieved successfully",
  "data": {
    "id": 21,
    "invoice_no": "INV-TYSCG-2026-0005",
    "proforma_invoice_no": "PRO-INV-TYSCG-2026-0005",
    "status": "waiting for payment",
    "tax_ppn": true,
    "tax_pph_23": true,
    "sub_total": "9174312",
    "ppn": "1009174",
    "pph": "183486",
    "total": "10000000",
    "payment_amount": "6000000",
    "payment_date": "2026-10-29T00:00:00.000Z",
    "payment_method": "transfer",
    "file_invoice": "/files/invoice/1761600000000-inv-0005.pdf",
    "is_final": false,
    "final_at": null,
    "file_final_invoice": [],
    "reject_type": null,
    "tax_invoice_status": "requested",
    "tax_invoice_no": null,
    "tax_invoice_date": null,
    "tax_invoice_attachment": [],
    "is_can_approve_reject": true,
    "action_label": "Upload Payment Proof Invoice",
    "is_can_upload_tax_invoice": false,
    "tax_invoice_action_label": "Upload Final Invoice & Tax Invoice (FP)",
    "payments": [
      {
        "id": 4,
        "amount": "6000000",
        "transfer_date": "2026-10-29T00:00:00.000Z",
        "bank_name": "BCA",
        "payment_method": "transfer",
        "status": "accepted",
        "note": "Termin 1",
        "verification_note": "Sesuai",
        "verified_at": "2026-10-29T05:00:00.000Z",
        "user_create": { "id": 5, "name": "Sales A", "email": "sales@example.com" },
        "user_verify": { "id": 7, "name": "AR AP", "email": "arap@example.com" },
        "payment_proof": [ { "id": 91, "original_name": "bukti-1.pdf", "url": "/files/invoice/...", "mime_type": "application/pdf", "size": 98000 } ]
      }
    ],
    "verification_progress": [
      { "id": 101, "status": "created", "note": "Invoice created from incoming payment list", "user": { "id": 7, "name": "AR AP" }, "revision_attachment": [] },
      { "id": 102, "status": "submitted", "note": "Invoice submitted", "user": { "id": 7, "name": "AR AP" }, "revision_attachment": [] },
      { "id": 103, "status": "approved", "note": "Invoice approved", "user": { "id": 8, "name": "SPV FAT" }, "revision_attachment": [] },
      { "id": 104, "status": "payment uploaded", "note": "Termin 1", "user": { "id": 5, "name": "Sales A" }, "revision_attachment": [] },
      { "id": 105, "status": "payment accepted", "note": "Sesuai", "user": { "id": 7, "name": "AR AP" }, "revision_attachment": [] },
      { "id": 106, "status": "tax invoice requested", "note": "Tax invoice requested automatically after a payment was accepted", "user": { "id": 7, "name": "AR AP" }, "revision_attachment": [] }
    ]
  }
}
```

Catatan field:

- `payments` dan `revision_attachment` di riwayat **hanya ada di detail** (`GET /:id`), tidak di list. `payments` diurutkan dari yang paling lama.
- `payments[].status`: `verification` (sedang dicek), `accepted` (diterima), `rejected` (ditolak, alasan di `verification_note`).
- `payment_amount`, `payment_date`, dan `payment_method` di invoice adalah ringkasan: total yang diterima, plus tanggal dan metode pembayaran terakhir yang diterima.
- `file_invoice` tidak lagi diisi, baik saat SPV approve maupun approve revisi. Field ini hanya terisi untuk invoice lama.
- `revision_attachment` berisi bukti chat klien, hanya ada pada riwayat `revision requested`.
- `wht_reject_attachment` berisi screenshot penolakan bukti potong, hanya ada pada riwayat `wht rejected`.
- `withholding_taxes` (hanya di detail): satu baris per jenis PPh yang wajib bukti potong. Lihat bagian 10.

## 3. Aturan tombol

Tombol aksi status hanya tampil kalau `is_can_approve_reject === true`:

| `status`                 | Tampilkan                                                 |
| ------------------------ | --------------------------------------------------------- |
| `pending`                | **Edit**, **Submit**                                      |
| `rejected`               | **Edit**, **Submit Ulang**. Tampilkan alasan SPV dari riwayat `rejected` terakhir |
| `on verification`        | **Approve** (modal: catatan) dan **Reject** (modal: jenis reject + alasan) |
| `waiting for payment`    | **Upload Bukti Bayar**. **Minta Revisi** hanya kalau `payment_amount` kosong atau 0 |
| `payment proof rejected` | **Upload Ulang Bukti Bayar**. Tampilkan juga alasan penolakan dari `verification_note` pembayaran terakhir |
| `payment verification`   | **Terima** dan **Tolak** (modal: alasan). Tampilkan pembayaran dengan `status === "verification"` untuk dicek |
| `revision requested`     | **Revisi PPh** (form bagian 9b) dan **Tolak Permintaan** (modal: alasan). Tampilkan alasan dan bukti chat dari riwayat `revision requested` terakhir |
| `waiting for revision`   | **Approve Revisi** (modal: catatan) dan **Reject Revisi** (modal: alasan) |
| `paid waiting wht`, `wht rejected` | **Upload Bukti Potong** pada setiap baris `withholding_taxes` yang `waiting` / `rejected`. Untuk `rejected`, tampilkan `note_reject` dan screenshot dari riwayat `wht rejected` terakhir |
| `wht verification`       | **Terima** (modal: checklist + nomor, masa pajak, tanggal) dan **Tolak** (modal: alasan + screenshot) pada setiap baris `withholding_taxes` yang `verification` |

Tombol Faktur Pajak:

| Kondisi                                                                 | Tampilkan                          |
| ----------------------------------------------------------------------- | ---------------------------------- |
| `tax_ppn === true`, `tax_invoice_status === "none"`, `status` bukan `pending` / `on verification` / `rejected` / `cancelled`, user Sales | **Request Faktur Pajak** |
| `is_can_upload_tax_invoice === true`                                    | **Upload Final Invoice & Faktur Pajak** (tanpa field FP kalau `tax_ppn === false`) |
| `tax_invoice_status === "issued"`                                       | **Download Final Invoice** (`file_final_invoice`), dan untuk invoice ber-PPN **Download Faktur Pajak** (`tax_invoice_attachment`) beserta nomor/tanggal FP |

Sejak status `waiting for payment`, Sales bisa membuka invoice Proforma. Kalau `file_invoice` terisi (invoice lama), tampilkan tombol download-nya. Setelah `is_final === true`, tampilkan label "Final" dan tombol download `file_final_invoice`.

## 4. Submit (AR & AP)

```http
PATCH /api/invoices/submit/21
```

```json
{ "note": "Tax dan debit note sudah dicek" }
```

`note` opsional. Hasil: `on verification`. Endpoint yang sama dipakai untuk submit ulang invoice `rejected` setelah AR & AP memperbaiki pajaknya.

## 5. Approve dan reject (SPV FAT Internal)

Approve tidak meng-upload file:

```http
PATCH /api/invoices/approve/21
```

```json
{ "note": "Sesuai" }
```

- `note` opsional. `file_invoice` yang dikirim ke endpoint ini diabaikan.
- Hasil: langsung `waiting for payment`.

Reject:

```http
PATCH /api/invoices/reject/21
```

```json
{ "reject_type": "tax", "note": "PPh 23 belum dihitung" }
```

| `reject_type`     | Kapan                                                        | Hasil                                                                 |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `tax` (default)   | Salah PPh / PPN                                              | `rejected`: kembali ke AR & AP untuk diedit dan di-submit ulang        |
| `ct/po cancelled` | CT/PO di-addendum, dibatalkan, atau direvisi sehingga isi invoice berubah | `cancelled` (status akhir): Sales membuat request invoice baru |

`note` opsional tetapi sebaiknya diwajibkan di form. `reject_type` tersimpan di invoice untuk ditampilkan di detail.

## 6. Upload bukti bayar (Sales)

```http
PATCH /api/invoices/upload-payment/21
```

```json
{
  "amount": 6000000,
  "transfer_date": "2026-10-29",
  "payment_method": "transfer",
  "bank_name": "BCA",
  "note": "Termin 1",
  "payment_proof": [
    {
      "original_name": "bukti-transfer.pdf",
      "stored_name": "1761700000000-bukti-transfer.pdf",
      "url": "/files/invoice/1761700000000-bukti-transfer.pdf",
      "mime_type": "application/pdf",
      "size": 120345
    }
  ]
}
```

| Field            | Wajib                | Label di form      | Keterangan                                                        |
| ---------------- | -------------------- | ------------------ | ----------------------------------------------------------------- |
| `amount`         | Ya                   | Nominal            | Bilangan bulat > 0, maksimal sisa tagihan                         |
| `transfer_date`  | Ya                   | Tanggal Transfer   | Format `YYYY-MM-DD`                                               |
| `payment_method` | Tidak                | Metode Pembayaran  | `transfer` (default) atau `cash`                                  |
| `bank_name`      | Ya, kalau `transfer` | Nama Bank Penerima | Teks bebas                                                        |
| `note`           | Tidak                | Catatan            |                                                                   |
| `payment_proof`  | Ya                   | Bukti Bayar        | Array file, minimal 1                                             |

Tips form:

- Tampilkan **Total**, **Sudah dibayar** (`payment_amount`), dan **Sisa tagihan** (`total − payment_amount`) di atas form.
- Isi default `amount` dengan sisa tagihan. Sales bisa menguranginya untuk pembayaran sebagian.
- Sembunyikan field bank kalau `payment_method === "cash"`.

Hasil: `payment verification`.

## 7. Verifikasi bukti bayar (AR & AP)

Tampilkan pembayaran yang sedang dicek, yaitu item `payments` dengan `status === "verification"` (hanya ada satu): nominal, tanggal transfer, bank, catatan, dan file `payment_proof`.

Terima (`note` opsional):

```http
PATCH /api/invoices/payment-accept/21
```

```json
{ "note": "Sesuai" }
```

Hasil: `waiting for payment` kalau masih ada sisa tagihan, atau `paid` kalau sudah lunas. Kalau Final Invoice / FP belum diminta, `tax_invoice_status` otomatis menjadi `requested` (invoice ber-PPN: Final Invoice + FP; tanpa PPN: Final Invoice saja). Cek `status` di response untuk menampilkan pesan yang tepat, misalnya "Pembayaran diterima, sisa tagihan Rp 4.000.000" atau "Invoice lunas".

Tolak (`note` **wajib**, tampilkan modal input alasan):

```http
PATCH /api/invoices/payment-reject/21
```

```json
{ "note": "Kurang bayar Rp 400.000" }
```

Hasil: `payment proof rejected`.

Kedua endpoint ini tidak butuh ID pembayaran, karena dalam satu waktu hanya ada satu bukti bayar yang diverifikasi.

## 8. Final Invoice dan Faktur Pajak

### 8a. Request faktur pajak (Sales)

Tampilkan konfirmasi dulu, karena request hanya bisa dilakukan sekali.

```http
PATCH /api/invoices/tax-invoice-request/21
```

```json
{ "note": "Klien minta FP sebelum bayar" }
```

`note` opsional. Hasil: `tax_invoice_status` menjadi `requested`. `status` invoice tidak berubah.

### 8b. Upload Final Invoice dan faktur pajak (AR & AP)

Upload file Final Invoice dan file FP dulu lewat `POST /api/uploads/invoice/single`, lalu:

```http
PATCH /api/invoices/tax-invoice/21
```

```json
{
  "file_final_invoice": [
    {
      "original_name": "inv-0005-final.pdf",
      "stored_name": "1761800000000-inv-0005-final.pdf",
      "url": "/files/invoice/1761800000000-inv-0005-final.pdf",
      "mime_type": "application/pdf",
      "size": 120000
    }
  ],
  "tax_invoice_no": "010.000-26.00000001",
  "tax_invoice_date": "2026-10-30",
  "note": "Final invoice dan FP terbit",
  "tax_invoice_attachment": [
    {
      "original_name": "faktur-pajak.pdf",
      "stored_name": "1761800000000-faktur-pajak.pdf",
      "url": "/files/invoice/1761800000000-faktur-pajak.pdf",
      "mime_type": "application/pdf",
      "size": 88000
    }
  ]
}
```

| Field                    | Wajib | Label di form        |
| ------------------------ | ----- | -------------------- |
| `file_final_invoice`     | Ya    | File Final Invoice, array file minimal 1 |
| `tax_invoice_no`         | Ya, kalau `tax_ppn`. Saat upload ulang setelah revisi boleh dikosongkan (memakai nomor lama) | Nomor Faktur Pajak   |
| `tax_invoice_date`       | Ya, kalau `tax_ppn`. Saat upload ulang setelah revisi boleh dikosongkan (memakai tanggal lama) | Tanggal Faktur Pajak |
| `tax_invoice_attachment` | Tidak | File Faktur Pajak (sebaiknya diwajibkan di form untuk invoice ber-PPN) |
| `note`                   | Tidak | Catatan              |

Untuk invoice tanpa PPN, cukup kirim `file_final_invoice` (dan `note`); field FP diabaikan.

Hasil: `tax_invoice_status` menjadi `issued`, `is_final` menjadi `true`, dan `final_at` terisi. ~~Setelah itu Final Invoice dan FP tidak bisa di-upload ulang.~~ *(Diubah 2026-11-10: upload ulang terbuka lagi kalau revisi PPh di-approve SPV setelah Final terbit. Di luar kondisi itu tetap tidak bisa. Saat upload ulang, field FP yang tidak dikirim memakai data lama; jangan kirim `tax_invoice_attachment: []` karena akan mengosongkan file FP.)* Sales cukup melihat dan men-download-nya; dokumen yang terbit tidak masuk My Task Sales.

## 9. Revisi tax

### 9a. Minta revisi (Sales)

Upload bukti chat klien dulu lewat `POST /api/uploads/invoice/single` atau `/multiple`, lalu:

```http
PATCH /api/invoices/revision-request/21
```

```json
{
  "note": "Klien baru menginfokan ada potongan PPh 23",
  "revision_attachment": [
    {
      "original_name": "chat-klien.png",
      "stored_name": "1761900000000-chat-klien.png",
      "url": "/files/invoice/1761900000000-chat-klien.png",
      "mime_type": "image/png",
      "size": 54000
    }
  ]
}
```

| Field                 | Wajib | Label di form                 |
| --------------------- | ----- | ----------------------------- |
| `note`                | Ya    | Alasan Revisi                 |
| `revision_attachment` | Ya    | Bukti Chat Klien (minimal 1)  |

Hasil: `revision requested`.

### 9b. Revisi PPh (AR & AP)

Tampilkan form berisi tiga checkbox PPh dengan nilai awal dari invoice. PPN tidak ditampilkan sebagai field yang bisa diubah.

```http
PATCH /api/invoices/revise/21
```

```json
{
  "tax_pph_23": true,
  "tax_pp_20": false,
  "tax_pph_4_ayat_2": false,
  "note": "PPh 23 ditambahkan sesuai permintaan klien"
}
```

| Field              | Wajib | Keterangan                                       |
| ------------------ | ----- | ------------------------------------------------ |
| `tax_pph_23`       | Tidak | Boolean. Kalau tidak dikirim, nilai lama dipakai |
| `tax_pp_20`        | Tidak | Boolean. Kalau tidak dikirim, nilai lama dipakai |
| `tax_pph_4_ayat_2` | Tidak | Boolean. Kalau tidak dikirim, nilai lama dipakai |
| `note`             | Tidak | Catatan                                          |

Backend menghitung ulang `pph`, `pp_20`, `pph_4_ayat_2`, dan `total` dari tarif pajak aktif. Hasil: `waiting for revision`.

### 9c. Tolak permintaan revisi (AR & AP)

```http
PATCH /api/invoices/revision-request-reject/21
```

```json
{ "note": "Bukti chat tidak menyebut PPh" }
```

`note` wajib. Hasil: kembali ke `waiting for payment`.

### 9d. Approve atau reject revisi (SPV FAT Internal)

Approve tidak meng-upload file:

```http
PATCH /api/invoices/revision-approve/21
```

```json
{ "note": "Sesuai" }
```

`note` opsional; `file_invoice` yang dikirim diabaikan. Hasil: `waiting for payment`.

Reject (`note` wajib):

```http
PATCH /api/invoices/revision-reject/21
```

```json
{ "note": "Seharusnya PPh 4 ayat 2, bukan PPh 23" }
```

Hasil: kembali ke `revision requested` supaya AR & AP merevisi ulang.

## 10. Bukti potong PPh (Withholding Tax)

Invoice yang dipotong **PPh 23** atau **PPh 4(2)** (`tax_pph_23` / `tax_pph_4_ayat_2` dengan nilai > 0) butuh bukti potong dari klien setelah lunas. PP 20 tidak butuh bukti potong.

Saat bukti bayar terakhir diterima, backend membuat satu baris di `withholding_taxes` per jenis PPh, dan invoice menjadi `paid waiting wht`. Sales menagih bukti potong ke klien, upload, lalu AR & AP memverifikasi. Setiap jenis PPh di-upload dan diverifikasi sendiri-sendiri.

```json
"withholding_taxes": [
  {
    "id": 51,
    "tax_type": "pph_23",
    "dpp": "9174312",
    "rate": "2.00",
    "amount": "183486",
    "status": "verification",
    "receipt_no": null,
    "tax_period": null,
    "receipt_date": null,
    "checklist": null,
    "note": "Bukti potong dari klien",
    "note_reject": null,
    "uploaded_at": "2026-11-03T02:00:00.000Z",
    "verified_at": null,
    "user_upload": { "id": 5, "name": "Sales A" },
    "user_verify": null,
    "withholding_tax_receipt": [{ "original_name": "bukti-potong.pdf", "url": "/files/invoice/...", "mime_type": "application/pdf" }]
  }
]
```

| Field | Isi |
| ----- | --- |
| `tax_type` | `pph_23` (PPh 23) atau `pph_4_ayat_2` (PPh 4(2)) |
| `dpp`, `rate`, `amount` | Diambil dari invoice: DPP = `sub_total`, tarif (%) dari master tax saat lunas, nilai = `pph` / `pph_4_ayat_2` |
| `status` | `waiting` (belum di-upload), `verification` (sedang dicek), `rejected` (ditolak), `clear` (diterima) |
| `receipt_no`, `tax_period`, `receipt_date` | Diisi AR & AP saat menerima |
| `checklist` | Hasil checklist AR & AP (lihat 10b) |
| `note_reject` | Alasan penolakan terakhir |

Status invoice mengikuti semua bukti potongnya: ada yang `verification` → `wht verification`; ada yang `rejected` → `wht rejected`; semua `clear` → `paid & clear`; selain itu `paid waiting wht`.

### 10a. Upload bukti potong (Sales)

Upload file dulu lewat `POST /api/uploads/invoice/single`, lalu:

```http
PATCH /api/invoices/21/withholding-taxes/51/upload
```

```json
{
  "note": "Bukti potong dari klien",
  "withholding_tax_receipt": [
    {
      "original_name": "bukti-potong.pdf",
      "stored_name": "1762100000000-bukti-potong.pdf",
      "url": "/files/invoice/1762100000000-bukti-potong.pdf",
      "mime_type": "application/pdf",
      "size": 50000
    }
  ]
}
```

- `withholding_tax_receipt` wajib, minimal 1 file. Upload ulang setelah ditolak **mengganti** file lama.
- Bisa untuk bukti potong `waiting` atau `rejected`, termasuk saat bukti potong jenis PPh lain sedang dicek.
- Hasil: bukti potong menjadi `verification`.

### 10b. Terima bukti potong (AR & AP)

```http
PATCH /api/invoices/21/withholding-taxes/51/accept
```

```json
{
  "checklist": {
    "recipient_npwp": true,
    "withholder_npwp": true,
    "receipt_no": true,
    "tax_period": true,
    "receipt_date": true,
    "dpp": true,
    "rate": true,
    "amount": true,
    "reference_date": true,
    "reference_no": true
  },
  "receipt_no": "BP-2026-000123",
  "tax_period": "11-2026",
  "receipt_date": "2026-11-03",
  "note": "Sesuai"
}
```

| Checklist key | Label di form |
| ------------- | ------------- |
| `recipient_npwp` | Identitas NPWP penerima penghasilan |
| `withholder_npwp` | Identitas NPWP pemotong pajak |
| `receipt_no` | Nomor bukti potong |
| `tax_period` | Masa pajak bukti potong |
| `receipt_date` | Tanggal bukti potong |
| `dpp` | Dasar pengenaan pajak (DPP) |
| `rate` | Tarif pajak |
| `amount` | Nilai PPh dipotong |
| `reference_date` | Tanggal dokumen referensi |
| `reference_no` | Nomor dokumen referensi |

- **Semua 10 item wajib `true`.** Kalau ada yang tidak sesuai, tombol Terima dinonaktifkan dan AR & AP memakai Tolak.
- `receipt_no` wajib, `tax_period` format `MM-YYYY`, `receipt_date` tanggal valid.
- Hasil: bukti potong menjadi `clear`. Kalau semua bukti potong sudah `clear`, invoice menjadi `paid & clear` dan datanya masuk Withholding Tax List.

### 10c. Tolak bukti potong (AR & AP)

```http
PATCH /api/invoices/21/withholding-taxes/51/reject
```

```json
{
  "note": "NPWP pemotong tidak sesuai",
  "checklist": { "recipient_npwp": true, "withholder_npwp": false },
  "wht_reject_attachment": [
    {
      "original_name": "npwp-salah.png",
      "stored_name": "1762100000000-npwp-salah.png",
      "url": "/files/invoice/1762100000000-npwp-salah.png",
      "mime_type": "image/png",
      "size": 30000
    }
  ]
}
```

- `note` dan `wht_reject_attachment` (minimal 1 screenshot) **wajib**.
- `checklist` opsional; kalau dikirim, item yang tidak `true` tersimpan sebagai `false` untuk menunjukkan apa yang salah.
- Hasil: bukti potong menjadi `rejected`. Alasan ada di `note_reject`, screenshot di riwayat `wht rejected`. Sales meminta perbaikan ke klien lalu upload ulang.

## 11. Pesan error yang perlu ditangani

| HTTP | Pesan                                                                 | Kapan                                                  |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| 400  | `amount must be a positive whole number`                              | Nominal kosong, 0, negatif, atau desimal               |
| 400  | `amount exceeds the remaining invoice balance (<sisa>)`               | Nominal melebihi sisa tagihan                          |
| 400  | `transfer_date is required`                                           | Tanggal transfer kosong                                |
| 400  | `payment_method must be transfer or cash`                             | Metode tidak valid                                     |
| 400  | `bank_name is required for transfer payments`                         | Transfer tanpa nama bank                               |
| 400  | `payment_proof must be a non-empty array`                             | Bukti bayar kosong                                     |
| 400  | `note is required for rejection`                                      | Tolak bukti bayar / permintaan revisi / revisi tanpa alasan |
| 400  | `Tax invoice is not needed for an invoice without PPN`                | Request FP untuk invoice tanpa PPN                     |
| 400  | `file_final_invoice must be a non-empty array`                        | Upload tanpa file Final Invoice                        |
| 400  | `tax_invoice_no is required`, `tax_invoice_date is required`          | Upload FP invoice ber-PPN tidak lengkap                |
| 400  | `reject_type must be one of: tax, ct/po cancelled`                    | Jenis reject tidak valid                               |
| 400  | `withholding_tax_receipt must be a non-empty array`                   | Upload bukti potong tanpa file                         |
| 400  | `checklist must be an object`, `Every checklist item must be checked to accept; reject the receipt instead (unchecked: ...)` | Terima bukti potong dengan checklist tidak lengkap |
| 400  | `receipt_no is required`, `tax_period must use MM-YYYY format`, `receipt_date must be a valid date` | Data bukti potong tidak lengkap |
| 400  | `wht_reject_attachment must be a non-empty array`                     | Tolak bukti potong tanpa screenshot                    |
| 404  | `Withholding tax not found`                                           | `whtId` bukan milik invoice ini                        |
| 409  | `Withholding tax receipt <aksi> is not allowed while the invoice is <status>` | Aksi bukti potong di status invoice yang salah |
| 409  | `Withholding tax receipt cannot be <aksi> while it is <status>`       | Aksi di status bukti potong yang salah (misalnya upload saat masih dicek) |
| 400  | `note is required to explain the revision`                            | Minta revisi tanpa alasan                              |
| 400  | `revision_attachment must be a non-empty array`                       | Minta revisi tanpa bukti chat                          |
| 400  | `tax_pph_23 must be a boolean` (atau `tax_pp_20`, `tax_pph_4_ayat_2`) | Nilai checkbox revisi bukan boolean                    |
| 403  | `You are not allowed to act on <fitur> with status "<status>"`        | User tidak terdaftar di approval flow status itu       |
| 404  | `Invoice not found`                                                   | ID tidak ada                                           |
| 409  | `Only a pending or rejected invoice can be edited; use the revision request after approval` | `PUT` saat invoice tidak `pending` / `rejected` |
| 409  | `Submit is not allowed while the invoice is <status>`, `Reject is not allowed while the invoice is <status>` | Submit/reject di status yang salah (misalnya invoice `cancelled`) |
| 409  | `Payment proof cannot be uploaded while the invoice is <status>`      | Upload bukti bayar di status yang salah (misalnya masih ada bukti yang sedang dicek) |
| 409  | `Payment proof cannot be verified while the invoice is <status>`      | Terima/tolak di status yang salah                      |
| 409  | `Tax invoice request is not allowed while the invoice is <status>`    | Request FP sebelum invoice di-approve                  |
| 409  | `Tax invoice has already been requested` / `... issued`               | Request FP kedua kali                                  |
| 409  | `Final invoice and tax invoice can only be uploaded after they are requested` | Upload sebelum diminta                         |
| 409  | `Final invoice and tax invoice have already been issued`              | Upload kedua kali                                      |
| 409  | `Invoice cannot be revised after a payment has been accepted`         | Minta revisi setelah ada pembayaran diterima           |
| 409  | `<aksi> is not allowed while the invoice is <status>`                 | Aksi revisi di status yang salah                       |
| 409  | `Action is not allowed from status "<status>"`                        | Aksi di status yang salah (pengecekan approval flow)   |

Pesan error ada di field `message` pada response. Error 403 dan 409 dengan pesan `Action is not allowed ...` / `You are not allowed ...` berasal dari pengecekan approval flow dan baru memblokir setelah backend mengaktifkan `APPROVAL_ENFORCE`. Selama itu belum aktif, gunakan flag dari backend untuk menyembunyikan tombol.

## Perubahan dari versi sebelumnya

| Sebelumnya                                                            | Sekarang                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `approve` → `approved` → `PATCH /signing/:id` → `signing` → `PATCH /waiting-for-payment/:id` (upload `file_invoice`) → `waiting for payment` | `PATCH /approve/:id` tanpa upload file → langsung `waiting for payment` |
| `PATCH /pay/:id`: AR & AP mengisi data bayar → `paid`                 | Sales `PATCH /upload-payment/:id` → AR & AP `PATCH /payment-accept/:id` atau `/payment-reject/:id` |
| Satu kali pembayaran per invoice                                      | Boleh bayar sebagian, riwayat di `payments`                           |
| Upload FP hanya saat `paid`, tanpa status                             | FP punya `tax_invoice_status`: request (Sales atau otomatis) → upload (AR & AP) |
| `PUT /:id` bisa mengedit invoice di status apa pun, termasuk `status` | `PUT /:id` hanya saat `pending`; perubahan tax setelah approve lewat revisi |
| Status `approved`, `signing`                                          | Dihapus                                                               |
| Lunas → `paid` (status akhir)                                         | Lunas → `paid waiting wht` (ada PPh 23 / PPh 4(2)) atau `paid & clear`; bukti potong lewat `withholding_taxes`. Status `paid` dihapus |
| Reject SPV selalu `rejected` (status akhir)                           | `reject_type`: `tax` → `rejected` (AR & AP edit + submit ulang), `ct/po cancelled` → `cancelled` (status akhir) |
| Upload FP hanya nomor, tanggal, dan file FP                           | Wajib `file_final_invoice`; invoice menjadi Final (`is_final`, `final_at`). Invoice tanpa PPN juga diminta Final Invoice setelah bukti bayar diterima |
| -                                                                     | Status baru `payment verification`, `payment proof rejected`, `revision requested`, `waiting for revision` |

Endpoint `/signing/:id`, `/waiting-for-payment/:id`, dan `/pay/:id` sudah dihapus dan akan mengembalikan 404.
