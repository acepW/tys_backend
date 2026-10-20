# GA Purchase Order: Daftar Status dan Aksi

Semua endpoint berawalan `/api/ga-purchase-orders`. Setiap aksi memakai `PATCH` dan mengembalikan detail order terbaru.

## Daftar status order

| Status                      | Arti / menunggu siapa                                                                     | Tombol yang tampil                         |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| `request ga manager`        | Menunggu approval HRGA SPV/Manager. Order masih bisa diedit oleh pembuatnya (`PUT /:id`). | Approve / Reject (GA Manager)              |
| `request director`          | Menunggu approval Direktur                                                                | Approve / Reject (Direktur)                |
| `request spv/manager fat`   | Menunggu approval Internal FAT SPV/Manager                                                | Approve / Reject (FAT)                     |
| `request cashier`           | Menunggu kasir melakukan pembayaran                                                       | Approve + form pembayaran / Reject (Kasir) |
| `request receiving`         | Menunggu GA Staff memproses setiap item (realisasi, penerimaan, return, refund)           | Lihat [Aksi per item](#aksi-per-item)      |
| `finished`                  | Selesai, semua item `accepted` atau `refunded`                                            | Tidak ada                                  |
| `rejected ga manager`       | Ditolak HRGA SPV/Manager                                                                  | Tidak ada                                  |
| `rejected director`         | Ditolak Direktur                                                                          | Tidak ada                                  |
| `rejected spv/manager fat`  | Ditolak FAT                                                                               | Tidak ada                                  |
| `rejected cashier`          | Ditolak kasir                                                                             | Tidak ada                                  |
| `return request ga manager` | Alur return lama (hanya order lama): menunggu approval HRGA SPV/Manager                   | Approve / Reject (GA Manager)              |
| `return request cashier`    | Alur return lama (hanya order lama): menunggu approval kasir                              | Approve / Reject (Kasir)                   |

Status `rejected ...` dan `finished` adalah status akhir. Status `return request ...` tidak lagi dibuat; keduanya hanya untuk order lama yang sudah terlanjur masuk alur return lama, dan akan kembali ke `request receiving`.

## Alur utama

```
request ga manager → request director → request spv/manager fat → request cashier
  → request receiving → finished (otomatis setelah semua item accepted / refunded)
```

## Total order

Order menyimpan `sub_total`, `ppn`, `pph` (PPh 23), `pp_20`, `pph_4_ayat_2`, dan `total`. Nilainya adalah **jumlah dari field yang sama di semua item**, dihitung ulang otomatis setiap order dibuat atau item-nya diubah lewat `PUT /:id`. Frontend tidak perlu mengirim field ini.

## Status penerimaan per item (`receiving_status`)

| Status             | Arti                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `pending`          | Barang belum diterima                                                                                     |
| `returned`         | Sebagian/seluruh qty dikirim balik ke vendor (`quantity_returned`), menunggu barang pengganti atau refund |
| `refund requested` | GA Staff mengajukan refund untuk qty yang di-return, menunggu approval FAT SPV/Manager                    |
| `accepted`         | Selesai: semua qty diterima dalam kondisi baik. Status akhir                                              |
| `refunded`         | Selesai: qty yang di-return diganti dengan refund yang sudah di-approve. Status akhir                     |

Aksi per item tidak mengubah status order. Order tetap `request receiving` sampai semua item `accepted` atau `refunded`, lalu otomatis `finished`.

Qty item:

| Field               | Isi                                                            |
| ------------------- | -------------------------------------------------------------- |
| `quantity`          | Qty yang dibeli                                                |
| `quantity_good`     | Total qty baik dari semua goods receipt (yang masuk inventory) |
| `quantity_returned` | Qty yang sedang dikembalikan ke vendor                         |
| `quantity_refunded` | Qty yang diselesaikan dengan refund                            |

**Qty tersisa** (yang harus diterima di penerimaan berikutnya) = `quantity - quantity_good - quantity_refunded`.

## Aksi per item

| Aksi                                 | Endpoint                                        | `receiving_status` yang diizinkan        | Hasil                                          |
| ------------------------------------ | ----------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| GA Staff simpan purchase realization | `PATCH /ga-staff/realization/:id/items/:itemId` | semua (selama order `request receiving`) | Data realisasi tersimpan; status tidak berubah |
| GA Staff Accepted                    | `PATCH /ga-staff/accept/:id/items/:itemId`      | `pending`, `returned`                    | `accepted`                                     |
| GA Staff Returned                    | `PATCH /ga-staff/return/:id/items/:itemId`      | `pending`, `returned`                    | `returned`                                     |
| GA Staff ajukan refund               | `PATCH /ga-staff/refund/:id/items/:itemId`      | `returned`                               | `refund requested`                             |
| FAT SPV/Manager approve refund       | `PATCH /fat/refund/approve/:id/items/:itemId`   | `refund requested`                       | `refunded`                                     |
| FAT SPV/Manager reject refund        | `PATCH /fat/refund/reject/:id/items/:itemId`    | `refund requested`                       | kembali `returned`                             |

`:itemId` adalah `id` item GA Purchase Order (`items[].id`). Semua aksi hanya bisa saat order berstatus `request receiving`. Kalau dipanggil dari status yang tidak sesuai, API mengembalikan error 409.

**Accept dan return hanya bisa dilakukan setelah purchase realization item tersebut disimpan.**

### Contoh skenario

Beli 5 unit, datang 3 bagus dan 2 rusak:

1. Simpan purchase realization item.
2. **Returned** dengan `quantity_good: 3` → 3 unit masuk inventory, `quantity_returned` = 2, status `returned`.
3. Pilih salah satu:
   - Barang pengganti datang → **Accepted** dengan `quantity_good: 2` → 2 unit masuk inventory, status `accepted`. Kalau pengganti masih ada yang rusak, **Returned** lagi dengan qty baiknya.
   - Vendor tidak mengganti → **Ajukan refund**, lalu FAT approve → status `refunded`.

## Endpoint persetujuan order

| Aksi                        | Endpoint                                                        | Status order yang diizinkan                       |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| GA Manager approve / reject | `PATCH /ga-manager/approve/:id`, `PATCH /ga-manager/reject/:id` | `request ga manager`, `return request ga manager` |
| Direktur approve / reject   | `PATCH /director/approve/:id`, `PATCH /director/reject/:id`     | `request director`                                |
| FAT approve / reject        | `PATCH /fat/approve/:id`, `PATCH /fat/reject/:id`               | `request spv/manager fat`                         |
| Kasir approve / reject      | `PATCH /cashier/approve/:id`, `PATCH /cashier/reject/:id`       | `request cashier`, `return request cashier`       |

## Body request

**Approve biasa** (opsional):

```json
{ "note": "Catatan" }
```

**Reject** (order maupun refund): `note` wajib diisi.

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

**GA Staff simpan purchase realization**: semua field wajib kecuali `note`. `files_purchase_proof` dan `files_invoice` wajib berisi minimal satu file. Boleh dipanggil lagi untuk mengoreksi data.

```json
{
  "purchase_realization_date": "2026-10-10",
  "purchase_realization_amount": 3330000,
  "note": "Catatan (opsional)",
  "files_purchase_proof": [],
  "files_invoice": []
}
```

**GA Staff Accepted**: semua field wajib kecuali `note`. `quantity_good` harus **sama dengan qty tersisa**; kalau ada yang tidak baik, pakai Returned.

```json
{
  "quantity_good": 5,
  "goods_in_date": "2026-10-12",
  "goods_status": "Good Without Exception",
  "note": "Catatan (opsional)",
  "files_goods_in": [],
  "files_goods_receipt": []
}
```

**GA Staff Returned**: semua field wajib. `quantity_good` boleh 0 dan harus **lebih kecil dari qty tersisa**; sisanya menjadi `quantity_returned`.

```json
{
  "quantity_good": 3,
  "goods_in_date": "2026-10-12",
  "goods_status": "Not Good",
  "note": "2 unit rusak, dikirim balik",
  "files_goods_in": [],
  "files_goods_receipt": [],
  "return_delivery_date": "2026-10-13",
  "return_shipping_cost": 25000,
  "files_return_delivery_proof": [],
  "files_return_waybill": []
}
```

| Field                         | Isi                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `quantity_good`               | Qty baik pada penerimaan ini; masuk inventory jika `item_category` = `item`              |
| `goods_in_date`               | Tanggal barang masuk                                                                     |
| `goods_status`                | `Good Without Exception`, `Good With Notes`, atau `Not Good`                             |
| `files_goods_in`              | File barang masuk                                                                        |
| `files_goods_receipt`         | File penerimaan barang (good receipt)                                                    |
| `return_delivery_date`        | Tanggal pengiriman balik ke vendor (return saja)                                         |
| `return_shipping_cost`        | Biaya pengiriman balik, boleh 0 (return saja)                                            |
| `files_return_delivery_proof` | Bukti pengiriman balik / proof of return delivery (return saja)                          |
| `files_return_waybill`        | File resi pengiriman balik (return saja)                                                 |

**GA Staff ajukan refund**: refund selalu menutup seluruh `quantity_returned` item. `refund_amount` harus lebih dari 0 dan `files_refund_proof` wajib berisi minimal satu file.

```json
{
  "refund_date": "2026-10-20",
  "refund_amount": 1332000,
  "note": "Catatan (opsional)",
  "files_refund_proof": []
}
```

**FAT approve refund**: `refund_received_date` (tanggal uang refund diterima) wajib, dan `files_refund_received_proof` (bukti penerimaan uang refund) wajib berisi minimal satu file. `note` opsional.

```json
{
  "refund_received_date": "2026-10-22",
  "note": "Catatan (opsional)",
  "files_refund_received_proof": []
}
```

**FAT reject refund**: `note` wajib; item kembali `returned` dan GA Staff bisa mengajukan refund ulang (data refund sebelumnya tetap tersimpan untuk diedit) atau menerima barang pengganti.

## List item yang di-return

`GET /returned-items` mengembalikan item yang pernah di-return minimal sekali (`return_count` > 0), beserta order induknya (`ga_purchase_order`: no, status, company), vendor, file, data refund, dan semua `receipts`.

Query opsional:

| Query                  | Isi                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `search`               | Cari berdasarkan nama barang (`item_name`) atau no GAPO (`ga_purchase_order_no`), sebagian kata juga cocok |
| `receiving_status`     | Mis. `returned` (masih di vendor), `refund requested` (menunggu FAT), `refunded`, `accepted` |
| `id_ga_purchase_order` | Filter per order                                                                             |
| `id_vendor`            | Filter per vendor                                                                            |
| `id_company`           | Filter per perusahaan (dari order)                                                           |
| `page`, `limit`        | Pagination, format sama dengan `GET /`                                                       |

## Field di response `GET /:id`

Order:

| Field                                                                                   | Isi                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `sub_total`, `ppn`, `pph`, `pp_20`, `pph_4_ayat_2`, `total`                             | Jumlah dari semua item                                                                                                                   |
| `payment_amount`, `payment_date`, `payment_method`, `petty_cash_method`, `payment_note` | Data pembayaran dari kasir                                                                                                               |
| `files_payment`                                                                         | Bukti bayar dari kasir                                                                                                                   |
| `verification_progress`                                                                 | Riwayat semua aksi (status, user, note, waktu). Aksi per item berisi `id_ga_purchase_order_item` dan `ga_purchase_order_item.item_name`. |

Setiap item (`items[]`):

| Field                                                                                   | Isi                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `receiving_status`                                                                      | Lihat tabel status per item                      |
| `quantity_good`, `quantity_returned`, `quantity_refunded`                               | Rekap qty                                        |
| `purchase_realization_date`, `purchase_realization_amount`, `purchase_realization_note` | Purchase realization                             |
| `files_purchase_proof`, `files_invoice`                                                 | File purchase realization                        |
| `refund_date`, `refund_amount`, `refund_note`, `files_refund_proof`                     | Data refund dari GA Staff                        |
| `refund_received_date`, `files_refund_received_proof`                                    | Penerimaan uang refund, diisi FAT saat approve   |
| `receiving_note`                                                                        | Note accept/return terakhir                      |
| `return_count`                                                                          | Berapa kali item sudah di-return                 |
| `receipts[]`                                                                            | Semua goods receipt item, urut dari yang pertama |

Setiap goods receipt (`items[].receipts[]`): `type` (`accept` / `return`), `quantity_received` (qty tersisa saat itu), `quantity_good`, `quantity_returned`, `goods_in_date`, `goods_status`, `return_delivery_date`, `return_shipping_cost`, `note`, `user`, dan file `files_goods_in`, `files_goods_receipt`, `files_return_delivery_proof`, `files_return_waybill`.

Format setiap file sama dengan file lain: `original_name`, `stored_name`, `url`, `mime_type`, `size`. `indonesian_name` dan `mandarin_name` opsional. Saat update (realization/refund), sertakan `id` file lama yang ingin dipertahankan. File yang tidak dikirim akan dihapus.

## Verification progress per item

| `status`                          | Dari aksi                |
| --------------------------------- | ------------------------ |
| `purchase realization saved`      | Simpan realisasi pertama |
| `purchase realization updated`    | Koreksi realisasi        |
| `goods accepted`                  | Accepted                 |
| `goods returned`                  | Returned                 |
| `refund requested`                | Ajukan refund            |
| `refund approved spv/manager fat` | FAT approve refund       |
| `refund rejected spv/manager fat` | FAT reject refund        |
| `finished`                        | Order selesai (otomatis) |

## Catatan untuk frontend

- API belum membatasi role. Frontend yang perlu menampilkan tombol sesuai role user.
- Saat order `request receiving`, per item:
  - Tampilkan form purchase realization. Tombol Accepted / Returned baru aktif setelah `purchase_realization_date` terisi.
  - Accepted / Returned tampil jika `receiving_status` = `pending` atau `returned`. Isi default `quantity_good` dengan qty tersisa.
  - Ajukan refund tampil jika `receiving_status` = `returned`.
  - Approve / Reject refund (FAT) tampil jika `receiving_status` = `refund requested`.
- Belum ada notifikasi otomatis. Untuk menampilkan riwayat gunakan `verification_progress`.

## Migrasi database

Jalankan sekali setelah deploy: `npm run db:sync-ga-purchase-order`. Script ini aman dijalankan ulang. Isinya: membuat tabel `ga_purchase_order_item_receipts`, menambah kolom baru, memperluas enum `receiving_status`, mengubah index `inventory_histories` agar satu item bisa punya beberapa riwayat stok, lalu mengisi total order, qty item, dan satu goods receipt untuk item yang di-accept dengan alur lama (file `files_goods_in` / `files_goods_receipt` item lama dipindah ke receipt tersebut).
