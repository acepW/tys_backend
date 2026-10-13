# GA Purchase Order: Daftar Status dan Aksi

Semua endpoint berawalan `/api/ga-purchase-orders`. Setiap aksi memakai `PATCH` dan mengembalikan detail order terbaru.

## Daftar status order

| Status                      | Arti / menunggu siapa                                                                     | Tombol yang tampil                                       |
| --------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `request ga manager`        | Menunggu approval HRGA SPV/Manager. Order masih bisa diedit oleh pembuatnya (`PUT /:id`). | Approve / Reject (GA Manager)                            |
| `request director`          | Menunggu approval Direktur                                                                | Approve / Reject (Direktur)                              |
| `request spv/manager fat`               | Menunggu approval Internal FAT SPV/Manager                                                | Approve / Reject (FAT)                                   |
| `request cashier`           | Menunggu kasir melakukan pembayaran                                                       | Approve + form pembayaran / Reject (Kasir)               |
| `request receiving`         | Menunggu GA Staff menerima setiap item                                                    | Accepted / Returned per item yang belum accepted (GA Staff) |
| `finished`                  | Selesai, semua item sudah accepted                                                        | Tidak ada                                                |
| `rejected ga manager`       | Ditolak HRGA SPV/Manager                                                                  | Tidak ada                                                |
| `rejected director`         | Ditolak Direktur                                                                          | Tidak ada                                                |
| `rejected spv/manager fat`              | Ditolak FAT                                                                               | Tidak ada                                                |
| `rejected cashier`          | Ditolak kasir                                                                             | Tidak ada                                                |
| `return request ga manager` | Alur return lama (hanya order lama): menunggu approval HRGA SPV/Manager                   | Approve / Reject (GA Manager)                            |
| `return request cashier`    | Alur return lama (hanya order lama): menunggu approval kasir                              | Approve / Reject (Kasir)                                 |

Status `rejected ...` dan `finished` adalah status akhir. Status `return request ...` tidak lagi dibuat; keduanya hanya untuk order lama yang sudah terlanjur masuk alur return lama, dan akan kembali ke `request receiving`.

## Alur utama

```
request ga manager → request director → request spv/manager fat → request cashier
  → request receiving → finished (otomatis setelah semua item accepted)
```

## Status penerimaan per item (`receiving_status`)

| Status     | Arti                                                       |
| ---------- | ---------------------------------------------------------- |
| `pending`  | Belum diproses GA Staff                                    |
| `returned` | Di-return, menunggu di-accept lagi                         |
| `accepted` | Diterima. Status akhir item; tidak bisa di-accept/return lagi |

Return item tidak mengubah status order. Order tetap `request receiving` sampai semua item `accepted`.

## Endpoint per aksi

| Aksi                        | Endpoint                                                        | Status order yang diizinkan                       |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| GA Manager approve / reject | `PATCH /ga-manager/approve/:id`, `PATCH /ga-manager/reject/:id` | `request ga manager`, `return request ga manager` |
| Direktur approve / reject   | `PATCH /director/approve/:id`, `PATCH /director/reject/:id`     | `request director`                                |
| FAT approve / reject        | `PATCH /fat/approve/:id`, `PATCH /fat/reject/:id`               | `request spv/manager fat`                                     |
| Kasir approve / reject      | `PATCH /cashier/approve/:id`, `PATCH /cashier/reject/:id`       | `request cashier`, `return request cashier`       |
| GA Staff Accepted per item  | `PATCH /ga-staff/accept/:id/items/:itemId`                      | `request receiving`                               |
| GA Staff Returned per item  | `PATCH /ga-staff/return/:id/items/:itemId`                      | `request receiving`                               |

`:itemId` adalah `id` item GA Purchase Order (`items[].id`). Kalau aksi dipanggil dari status yang tidak sesuai, atau item sudah accepted, API mengembalikan error 409.

## Body request

**Approve biasa** (opsional):

```json
{ "note": "Catatan" }
```

**Reject**: `note` wajib diisi.

```json
{ "note": "Alasan penolakan" }
```

**Kasir approve saat `request cashier`**: `payment_amount`, `payment_date`, `payment_method`, dan minimal satu file di `files_payment` wajib diisi.

- `payment_method`: `petty cash` atau `bank`.
- `petty_cash_method`: `cash` atau `transfer`. Wajib jika `payment_method` = `petty cash`. Untuk `bank`, nilainya disimpan `null`.

```json
{
  "payment_amount": 6660000,
  "payment_date": "2026-10-06",
  "payment_method": "petty cash",
  "petty_cash_method": "cash",
  "payment_note": "Catatan",
  "files_payment": []
}
```

**GA Staff Accepted per item**: semua field wajib kecuali `note`. Setiap kategori file wajib berisi minimal satu file.

```json
{
  "purchase_realization_date": "2026-10-10",
  "purchase_realization_amount": 3330000,
  "goods_in_date": "2026-10-12",
  "goods_status": "Good Without Exception",
  "note": "Catatan (opsional)",
  "files_purchase_proof": [],
  "files_invoice": [],
  "files_goods_in": [],
  "files_goods_receipt": []
}
```

| Field                         | Isi                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `files_purchase_proof`        | Bukti pembelian                                                                               |
| `files_invoice`               | Invoice                                                                                       |
| `purchase_realization_date`   | Tanggal realisasi pembelian                                                                   |
| `purchase_realization_amount` | Nilai realisasi pembelian                                                                     |
| `goods_in_date`               | Tanggal barang masuk                                                                          |
| `files_goods_in`              | File barang masuk                                                                             |
| `files_goods_receipt`         | File penerimaan barang                                                                        |
| `goods_status`                | `Good Without Exception`, `Good With Notes`, `Not Good Refund`, atau `Not Good Returned`      |

Setelah accepted, item dengan `item_category` = `item` otomatis masuk inventory. Item `services` tidak masuk inventory.

**GA Staff Returned per item**: hanya `note`, wajib.

```json
{ "note": "Barang rusak, minta tukar" }
```

## Field di response `GET /:id`

Order:

| Field                                                                                        | Isi                                                                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `payment_amount`, `payment_date`, `payment_method`, `petty_cash_method`, `payment_note`      | Data pembayaran dari kasir                                                         |
| `files_payment`                                                                              | Bukti bayar dari kasir                                                             |
| `verification_progress`                                                                      | Riwayat semua aksi (status, user, note, waktu). Aksi per item berisi `id_ga_purchase_order_item` dan `ga_purchase_order_item.item_name`. |

Setiap item (`items[]`):

| Field                                                                                       | Isi                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `receiving_status`                                                                          | `pending`, `returned`, atau `accepted`      |
| `purchase_realization_date`, `purchase_realization_amount`, `goods_in_date`, `goods_status` | Data penerimaan dari GA Staff               |
| `receiving_note`                                                                            | Note accept/return terakhir                 |
| `return_count`                                                                              | Berapa kali item sudah di-return            |
| `files_purchase_proof`, `files_invoice`, `files_goods_in`, `files_goods_receipt`            | File penerimaan item                        |

Format setiap file sama dengan file lain: `original_name`, `stored_name`, `url`, `mime_type`, `size`. `indonesian_name` dan `mandarin_name` opsional. Saat update, sertakan `id` file lama yang ingin dipertahankan. File yang tidak dikirim akan dihapus.

## Catatan untuk frontend

- API belum membatasi role. Frontend yang perlu menampilkan tombol sesuai role user.
- Tampilkan tombol Accepted / Returned per item selama `receiving_status` bukan `accepted` dan order berstatus `request receiving`.
- Belum ada notifikasi otomatis. Untuk menampilkan riwayat gunakan `verification_progress`.
