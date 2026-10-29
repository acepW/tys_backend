# Panduan Frontend: Invoice (Approval, Pembayaran, Faktur Pajak, Revisi)

Invoice penjualan dibuat AR & AP dari pembayaran contract/PO yang sudah dibuka (incoming), di-submit, lalu di-approve SPV FAT Internal sekaligus meng-upload file invoice. Setelah itu Sales bisa meminta Faktur Pajak (FP), meminta revisi tax, atau meng-upload bukti bayar dari klien yang kemudian diverifikasi AR & AP sampai invoice lunas. Semua endpoint berawalan `/api/invoices` dan memakai cookie login yang sama seperti endpoint lain.

Alur ini mengikuti dokumen kebutuhan "Kebutuhan Sistem - FAT Internal". Progres per poin dokumen ada di [invoice-approval-fat.md](invoice-approval-fat.md).

## Konsep singkat

### Alur status invoice (`status`)

```text
pending ─submit─► on verification ─approve + file invoice─► waiting for payment ◄──────────────────┐
                         └─reject─► rejected                   │          │                       │ belum lunas
                                                               │          │ Sales upload bukti bayar
                                                               │          ▼                       │
                                                               │   payment verification ─terima───┤
                                                               │          │ tolak                 │ lunas
                                                               │          ▼                       ▼
                                                               │   payment proof rejected        paid
                                                               │     (Sales upload ulang)
                                                               │
                                                               └─ Sales minta revisi ─► revision requested ─AR & AP revisi PPh─► waiting for revision
                                                                  (AR & AP tolak permintaan ─► waiting for payment)     (SPV tolak ─► revision requested)
                                                                                                                        (SPV approve ─► waiting for payment)
```

| Status                   | Arti                                                     | Siapa yang beraksi | Tombol yang tampil                 |
| ------------------------ | -------------------------------------------------------- | ------------------ | ---------------------------------- |
| `pending`                | Draft invoice dibuat AR & AP                             | AR & AP            | Edit, Submit                       |
| `on verification`        | Menunggu SPV FAT Internal / Manager                      | SPV FAT Internal   | Approve (dengan upload file invoice), Reject |
| `waiting for payment`    | Invoice bisa di-download Sales, menunggu klien membayar  | Sales              | Upload Bukti Bayar, Minta Revisi   |
| `payment verification`   | Bukti bayar sedang dicek AR & AP                         | AR & AP            | Terima, Tolak                      |
| `payment proof rejected` | Bukti bayar ditolak AR & AP (alasan di riwayat)          | Sales              | Upload Ulang Bukti Bayar           |
| `revision requested`     | Sales minta revisi tax, menunggu AR & AP                 | AR & AP            | Revisi PPh, Tolak Permintaan       |
| `waiting for revision`   | Hasil revisi menunggu SPV FAT Internal                   | SPV FAT Internal   | Approve Revisi (opsional upload file invoice baru), Reject Revisi |
| `paid`                   | Lunas                                                    | -                  | Tidak ada                          |
| `rejected`               | Ditolak SPV                                              | -                  | Tidak ada                          |

- `paid` dan `rejected` adalah status akhir. Invoice yang ditolak SPV belum bisa dibuka lagi.
- Tombol **Request Faktur Pajak** tidak tergantung status di atas. Lihat bagian berikut.

### Faktur Pajak (`tax_invoice_status`)

Faktur Pajak (FP) punya status sendiri di kolom `tax_invoice_status`, terpisah dari `status`, karena bisa berjalan bersamaan dengan pembayaran.

```text
none ─Sales request FP (1x) / bukti bayar pertama diterima─► requested ─AR & AP upload FP─► issued
```

| `tax_invoice_status` | Arti                                              | Tombol yang tampil              |
| -------------------- | ------------------------------------------------- | ------------------------------- |
| `none`               | FP belum diminta                                  | Request Faktur Pajak (Sales)    |
| `requested`          | Menunggu AR & AP membuat dan meng-upload FP       | Upload Faktur Pajak (AR & AP)   |
| `issued`             | FP sudah terbit, bisa di-download                 | Download Faktur Pajak           |

- **Hanya invoice dengan PPN** (`tax_ppn === true`) yang butuh FP. Invoice tanpa PPN tetap `none` dan tombol Request FP disembunyikan.
- Sales bisa request FP **satu kali**, kapan pun setelah invoice di-approve SPV (termasuk saat bukti bayar sedang dicek), selama `tax_invoice_status === "none"`.
- Kalau Sales belum request, FP otomatis menjadi `requested` saat bukti bayar pertama **diterima** AR & AP.
- Mengubah `status` tidak mengubah `tax_invoice_status`, dan sebaliknya.

### Bayar sebagian

Satu invoice boleh dibayar beberapa kali. Setiap bukti bayar diverifikasi satu per satu:

- Kalau bukti bayar **diterima** dan totalnya **belum** menutup tagihan, invoice kembali ke `waiting for payment` supaya Sales bisa upload pembayaran berikutnya.
- Kalau totalnya **sudah** menutup tagihan, invoice menjadi `paid`.
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
| `is_can_upload_tax_invoice` | `true` kalau user login boleh meng-upload FP (`tax_invoice_status === "requested"`)           |
| `tax_invoice_action_label`  | `Upload Tax Invoice (FP)` saat FP diminta, selain itu `null`                                  |

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
| `rejected`                  | SPV reject (alasan di `note`)                            |
| `payment uploaded`          | Sales upload bukti bayar                                 |
| `payment accepted`          | AR & AP menerima bukti bayar                             |
| `payment rejected`          | AR & AP menolak bukti bayar (alasan di `note`)           |
| `tax invoice requested`     | FP diminta Sales, atau otomatis setelah bukti bayar diterima |
| `tax invoice issued`        | AR & AP meng-upload FP                                   |
| `revision requested`        | Sales minta revisi (alasan di `note`, bukti chat di `revision_attachment`) |
| `revision request rejected` | AR & AP menolak permintaan revisi (alasan di `note`)     |
| `revised`                   | AR & AP merevisi PPh                                     |
| `revision approved`         | SPV approve revisi                                       |
| `revision rejected`         | SPV menolak revisi, kembali ke AR & AP (alasan di `note`) |

Invoice lama bisa masih punya progress `signing`, `waiting for payment`, atau `paid` dari alur sebelumnya. Tampilkan apa adanya.

## Endpoint

| Aksi                       | Method & endpoint                                 | Syarat                                         |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| List                       | `GET /api/invoices`                               | Filter: `status`, `id_company`, `id_customer`, `id_contract`, `id_pre_order`, `id_quotation`, `source_type`, `search`, `page`, `limit` |
| Detail                     | `GET /api/invoices/:id`                           |                                                |
| Daftar incoming            | `GET /api/invoices/incoming`                      | Query: `status` (`incoming`/`history`), `source_type` (`all`/`contract`/`pre_order`), `search`, `page`, `limit` |
| Nomor invoice berikutnya   | `GET /api/invoices/no/documents`                  |                                                |
| Buat dari incoming         | `POST /api/invoices/from-incoming`                |                                                |
| Edit draft                 | `PUT /api/invoices/:id`                           | `status` = `pending`                           |
| Submit                     | `PATCH /api/invoices/submit/:id`                  | `status` = `pending`                           |
| Approve                    | `PATCH /api/invoices/approve/:id`                 | `status` = `on verification`                   |
| Reject                     | `PATCH /api/invoices/reject/:id`                  | `status` = `on verification`                   |
| Upload bukti bayar         | `PATCH /api/invoices/upload-payment/:id`          | `status` = `waiting for payment` / `payment proof rejected` |
| Terima bukti bayar         | `PATCH /api/invoices/payment-accept/:id`          | `status` = `payment verification`              |
| Tolak bukti bayar          | `PATCH /api/invoices/payment-reject/:id`          | `status` = `payment verification`              |
| Request faktur pajak       | `PATCH /api/invoices/tax-invoice-request/:id`     | `tax_ppn`, `tax_invoice_status` = `none`, sudah di-approve SPV |
| Upload faktur pajak        | `PATCH /api/invoices/tax-invoice/:id`             | `tax_invoice_status` = `requested`             |
| Minta revisi               | `PATCH /api/invoices/revision-request/:id`        | `status` = `waiting for payment`, belum ada pembayaran diterima |
| Tolak permintaan revisi    | `PATCH /api/invoices/revision-request-reject/:id` | `status` = `revision requested`                |
| Revisi PPh                 | `PATCH /api/invoices/revise/:id`                  | `status` = `revision requested`                |
| Approve revisi             | `PATCH /api/invoices/revision-approve/:id`        | `status` = `waiting for revision`              |
| Reject revisi              | `PATCH /api/invoices/revision-reject/:id`         | `status` = `waiting for revision`              |

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

Untuk field berbentuk **array file** (`payment_proof`, `tax_invoice_attachment`, `revision_attachment`), kirim objek ini apa adanya. Untuk `file_invoice` (approve dan approve revisi), kirim **string `url`-nya saja**.

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

`PUT /api/invoices/:id` hanya bisa selama `pending`. Setelah itu, perubahan tax harus lewat revisi (bagian 9). Field `status` dan `tax_invoice_status` di body `PUT` diabaikan.

## 2. List dan detail

`GET /api/invoices/:id` (potongan field yang relevan untuk alur ini):

```json
{
  "success": true,
  "code": 200,
  "message": "Invoice retrieved successfully",
  "data": {
    "id": 21,
    "invoice_no": "INV-TYSCG-2026-0005",
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
    "tax_invoice_status": "requested",
    "tax_invoice_no": null,
    "tax_invoice_date": null,
    "tax_invoice_attachment": [],
    "is_can_approve_reject": true,
    "action_label": "Upload Payment Proof Invoice",
    "is_can_upload_tax_invoice": false,
    "tax_invoice_action_label": "Upload Tax Invoice (FP)",
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
- `file_invoice` adalah URL file invoice dari SPV. Tampilkan sebagai tombol download untuk Sales.
- `revision_attachment` berisi bukti chat klien, hanya ada pada riwayat `revision requested`.

## 3. Aturan tombol

Tombol aksi status hanya tampil kalau `is_can_approve_reject === true`:

| `status`                 | Tampilkan                                                 |
| ------------------------ | --------------------------------------------------------- |
| `pending`                | **Edit**, **Submit**                                      |
| `on verification`        | **Approve** (modal: upload file invoice + catatan) dan **Reject** (modal: alasan) |
| `waiting for payment`    | **Upload Bukti Bayar**. **Minta Revisi** hanya kalau `payment_amount` kosong atau 0 |
| `payment proof rejected` | **Upload Ulang Bukti Bayar**. Tampilkan juga alasan penolakan dari `verification_note` pembayaran terakhir |
| `payment verification`   | **Terima** dan **Tolak** (modal: alasan). Tampilkan pembayaran dengan `status === "verification"` untuk dicek |
| `revision requested`     | **Revisi PPh** (form bagian 9b) dan **Tolak Permintaan** (modal: alasan). Tampilkan alasan dan bukti chat dari riwayat `revision requested` terakhir |
| `waiting for revision`   | **Approve Revisi** (modal: catatan + upload file invoice baru, opsional) dan **Reject Revisi** (modal: alasan) |

Tombol Faktur Pajak:

| Kondisi                                                                 | Tampilkan                          |
| ----------------------------------------------------------------------- | ---------------------------------- |
| `tax_ppn === true`, `tax_invoice_status === "none"`, `status` bukan `pending` / `on verification` / `rejected`, user Sales | **Request Faktur Pajak** |
| `is_can_upload_tax_invoice === true`                                    | **Upload Faktur Pajak**            |
| `tax_invoice_status === "issued"`                                       | **Download Faktur Pajak** (`tax_invoice_attachment`) dan nomor/tanggal FP |

Tombol download file invoice (`file_invoice`) tampil untuk semua user sejak status `waiting for payment`.

## 4. Submit (AR & AP)

```http
PATCH /api/invoices/submit/21
```

```json
{ "note": "Tax dan debit note sudah dicek" }
```

`note` opsional. Hasil: `on verification`.

## 5. Approve dan reject (SPV FAT Internal)

Approve sambil meng-upload file invoice. Upload file dulu lewat `POST /api/uploads/invoice/single`, lalu kirim `url`-nya:

```http
PATCH /api/invoices/approve/21
```

```json
{ "note": "Sesuai", "file_invoice": "/files/invoice/1761600000000-inv-0005.pdf" }
```

- `file_invoice` dan `note` opsional di backend, tetapi sebaiknya form approve mewajibkan file karena Sales butuh file ini untuk dikirim ke klien.
- Hasil: langsung `waiting for payment`.

Reject:

```http
PATCH /api/invoices/reject/21
```

```json
{ "note": "PPh 23 belum dihitung" }
```

Hasil: `rejected` (status akhir).

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

Hasil: `waiting for payment` kalau masih ada sisa tagihan, atau `paid` kalau sudah lunas. Kalau invoice ber-PPN dan FP belum diminta, `tax_invoice_status` otomatis menjadi `requested`. Cek `status` di response untuk menampilkan pesan yang tepat, misalnya "Pembayaran diterima, sisa tagihan Rp 4.000.000" atau "Invoice lunas".

Tolak (`note` **wajib**, tampilkan modal input alasan):

```http
PATCH /api/invoices/payment-reject/21
```

```json
{ "note": "Kurang bayar Rp 400.000" }
```

Hasil: `payment proof rejected`.

Kedua endpoint ini tidak butuh ID pembayaran, karena dalam satu waktu hanya ada satu bukti bayar yang diverifikasi.

## 8. Faktur Pajak

### 8a. Request faktur pajak (Sales)

Tampilkan konfirmasi dulu, karena request hanya bisa dilakukan sekali.

```http
PATCH /api/invoices/tax-invoice-request/21
```

```json
{ "note": "Klien minta FP sebelum bayar" }
```

`note` opsional. Hasil: `tax_invoice_status` menjadi `requested`. `status` invoice tidak berubah.

### 8b. Upload faktur pajak (AR & AP)

Upload file FP dulu lewat `POST /api/uploads/invoice/single`, lalu:

```http
PATCH /api/invoices/tax-invoice/21
```

```json
{
  "tax_invoice_no": "010.000-26.00000001",
  "tax_invoice_date": "2026-10-30",
  "note": "FP terbit",
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
| `tax_invoice_no`         | Ya    | Nomor Faktur Pajak   |
| `tax_invoice_date`       | Ya    | Tanggal Faktur Pajak |
| `tax_invoice_attachment` | Tidak | File Faktur Pajak (sebaiknya diwajibkan di form) |
| `note`                   | Tidak | Catatan              |

Hasil: `tax_invoice_status` menjadi `issued`. Setelah itu FP tidak bisa di-upload ulang. Sales cukup melihat dan men-download-nya; FP yang terbit tidak masuk My Task Sales.

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

Approve, opsional dengan file invoice baru yang sudah memakai tax hasil revisi:

```http
PATCH /api/invoices/revision-approve/21
```

```json
{ "note": "Sesuai", "file_invoice": "/files/invoice/1762000000000-inv-0005-rev.pdf" }
```

Hasil: `waiting for payment`. Kalau `file_invoice` dikirim, file invoice lama diganti.

Reject (`note` wajib):

```http
PATCH /api/invoices/revision-reject/21
```

```json
{ "note": "Seharusnya PPh 4 ayat 2, bukan PPh 23" }
```

Hasil: kembali ke `revision requested` supaya AR & AP merevisi ulang.

## 10. Pesan error yang perlu ditangani

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
| 400  | `tax_invoice_no is required`, `tax_invoice_date is required`          | Upload FP tidak lengkap                                |
| 400  | `note is required to explain the revision`                            | Minta revisi tanpa alasan                              |
| 400  | `revision_attachment must be a non-empty array`                       | Minta revisi tanpa bukti chat                          |
| 400  | `tax_pph_23 must be a boolean` (atau `tax_pp_20`, `tax_pph_4_ayat_2`) | Nilai checkbox revisi bukan boolean                    |
| 403  | `You are not allowed to act on <fitur> with status "<status>"`        | User tidak terdaftar di approval flow status itu       |
| 404  | `Invoice not found`                                                   | ID tidak ada                                           |
| 409  | `Only a pending invoice can be edited; use the revision request after approval` | `PUT` setelah invoice di-submit              |
| 409  | `Payment proof cannot be uploaded while the invoice is <status>`      | Upload bukti bayar di status yang salah (misalnya masih ada bukti yang sedang dicek) |
| 409  | `Payment proof cannot be verified while the invoice is <status>`      | Terima/tolak di status yang salah                      |
| 409  | `Tax invoice request is not allowed while the invoice is <status>`    | Request FP sebelum invoice di-approve                  |
| 409  | `Tax invoice has already been requested` / `... issued`               | Request FP kedua kali                                  |
| 409  | `Tax invoice can only be uploaded after it is requested`              | Upload FP sebelum diminta                              |
| 409  | `Tax invoice has already been issued`                                 | Upload FP kedua kali                                   |
| 409  | `Invoice cannot be revised after a payment has been accepted`         | Minta revisi setelah ada pembayaran diterima           |
| 409  | `<aksi> is not allowed while the invoice is <status>`                 | Aksi revisi di status yang salah                       |
| 409  | `Action is not allowed from status "<status>"`                        | Aksi di status yang salah (pengecekan approval flow)   |

Pesan error ada di field `message` pada response. Error 403 dan 409 dengan pesan `Action is not allowed ...` / `You are not allowed ...` berasal dari pengecekan approval flow dan baru memblokir setelah backend mengaktifkan `APPROVAL_ENFORCE`. Selama itu belum aktif, gunakan flag dari backend untuk menyembunyikan tombol.

## Perubahan dari versi sebelumnya

| Sebelumnya                                                            | Sekarang                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `approve` → `approved` → `PATCH /signing/:id` → `signing` → `PATCH /waiting-for-payment/:id` (upload `file_invoice`) → `waiting for payment` | `PATCH /approve/:id` dengan `file_invoice` → langsung `waiting for payment` |
| `PATCH /pay/:id`: AR & AP mengisi data bayar → `paid`                 | Sales `PATCH /upload-payment/:id` → AR & AP `PATCH /payment-accept/:id` atau `/payment-reject/:id` |
| Satu kali pembayaran per invoice                                      | Boleh bayar sebagian, riwayat di `payments`                           |
| Upload FP hanya saat `paid`, tanpa status                             | FP punya `tax_invoice_status`: request (Sales atau otomatis) → upload (AR & AP) |
| `PUT /:id` bisa mengedit invoice di status apa pun, termasuk `status` | `PUT /:id` hanya saat `pending`; perubahan tax setelah approve lewat revisi |
| Status `approved`, `signing`                                          | Dihapus                                                               |
| -                                                                     | Status baru `payment verification`, `payment proof rejected`, `revision requested`, `waiting for revision` |

Endpoint `/signing/:id`, `/waiting-for-payment/:id`, dan `/pay/:id` sudah dihapus dan akan mengembalikan 404.
