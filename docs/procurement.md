# Purchase Request dan GA Purchase Order

`scripts/procurement-schema.sql` dipakai untuk instalasi manual pada database baru. Pada database yang sudah berisi status dengan underscore, jalankan `node scripts/migrate-procurement-status-spaces.js` untuk memperbarui DB1 dan DB2. SQL migrasinya ada di `scripts/procurement-status-spaces.sql`. `server.js` memiliki opsi `syncProcurementModels()` untuk membuat tabel yang belum ada; `sync({ alter: false })` tidak mengubah enum tabel lama.
Semua endpoint memakai autentikasi yang sama dengan modul lain.

## Nomor dokumen

- `GET /api/purchase-requests/no/documents` mengembalikan `no_purchase_request`, contoh `PUR-TYSCG-2026-00001`.
- `GET /api/ga-purchase-orders/no/documents` mengembalikan `no_ga_purchase_order`, contoh `GAPO-TYSCG-2026-00001`.
- Nomor berurut per perusahaan dan tahun berdasarkan dokumen yang sudah dibuat. Kirim nomor tersebut saat create. Kolom nomor memiliki unique constraint.

## Purchase Request

`POST /api/purchase-requests`:

```json
{
  "purchase_request_no": "PUR-TYSCG-2026-00001",
  "id_company": 1,
  "id_department": 2,
  "id_division": 3,
  "request_date": "2026-09-29",
  "purchase_request_category": "Office Equipment",
  "items": [
    {
      "item_name": "Printer",
      "brand": "HP",
      "serial_number": "M404dn",
      "size": "A4",
      "material": "Plastic",
      "other": "Laser, duplex",
      "quantity_unit": "unit",
      "quantity": 2,
      "procurement_type": "Pengadaan Baru",
      "remarks": "For operations",
      "files_product": []
    }
  ]
}
```

`id_user_request` dan `id_requester` pada setiap item selalu diambil dari user login; nilai keduanya dalam body diabaikan. `id_department` dan `id_division` memakai data user login jika tidak dikirim. `purchase_request_category` item selalu mengikuti header.

- `GET /api/purchase-requests` dan `GET /api/purchase-requests/:id` menampilkan item, file, dan verification progress. Daftar dapat difilter dengan `id_company`, `id_department`, `id_division`, `status`, dan `purchase_request_category`.
- `PUT /api/purchase-requests/:id` mengubah draft `pending` milik pembuat. Jika `items` dikirim, daftar itu menggantikan daftar lama; sertakan `id` item untuk mempertahankannya. Jika `items` tidak dikirim, daftar lama dipertahankan.
- `PATCH /api/purchase-requests/request-manager/:id`: `pending` → `request manager`.
- `PATCH /api/purchase-requests/manager/approve/:id`: `request manager` → `request ga`.
- `PATCH /api/purchase-requests/manager/reject/:id`: body `{ "note": "Alasan" }` → `rejected manager`.
- `PATCH /api/purchase-requests/ga/approve/:id`: semua item harus mendapat keputusan; minimal satu disetujui:

```json
{
  "note": "Diperiksa GA",
  "item_decisions": [
    { "id_purchase_request_item": 11, "decision": "approved" },
    { "id_purchase_request_item": 12, "decision": "rejected" }
  ]
}
```

- `PATCH /api/purchase-requests/ga/reject/:id`: body `{ "note": "Alasan" }` menolak seluruh item.
- `GET /api/purchase-requests/to-process-ga-order` menampilkan item yang disetujui GA dan belum masuk order. Bisa difilter dengan `id_company`.

## GA Purchase Order

`POST /api/ga-purchase-orders` memakai item yang tersedia pada endpoint `to-process-ga-order`. Detail barang, pemohon, kategori, dan pengadaan disalin dari Purchase Request. `id_company` diturunkan dari item sumber; semua item dalam satu order harus berasal dari perusahaan yang sama.

```json
{
  "ga_purchase_order_no": "GAPO-TYSCG-2026-00001",
  "request_date": "2026-09-29",
  "planned_purchase_date": "2026-10-10",
  "remarks": "Pembelian printer",
  "file_attachment": [],
  "items": [
    {
      "id_purchase_request": 1,
      "id_purchase_request_item": 11,
      "id_vendor": 4,
      "estimated_unit_price": 3000000,
      "estimated_total_price": 6000000,
      "sub_total": 6000000,
      "tax_ppn": true,
      "tax_pph_23": false,
      "tax_pp_20": false,
      "tax_pph_4_ayat_2": false,
      "ppn": 660000,
      "pph": 0,
      "pp_20": 0,
      "pph_4_ayat_2": 0,
      "total": 6660000,
      "files_product": [],
      "files_attachment": []
    }
  ]
}
```

Jika `files_product` item tidak dikirim saat create, file produk dari Purchase Request disalin. Jika `estimated_total_price`, `sub_total`, atau `total` tidak dikirim, nilainya dihitung dari quantity, harga satuan, dan nominal pajak yang dikirim. Item sumber langsung ditandai sudah masuk order dalam transaksi yang sama.

- `GET /api/ga-purchase-orders` dan `GET /api/ga-purchase-orders/:id` menampilkan item, file, dan verification progress. Daftar dapat difilter dengan `id_company` dan `status`.
- `PUT /api/ga-purchase-orders/:id` hanya dapat dilakukan pembuat selama status `request ga manager`. `items` yang dikirim menggantikan daftar lama; item yang dihapus dari draft dilepas kembali agar dapat masuk order lain.
### Alur approval GA Purchase Order

| Tahap | Endpoint approve | Status awal → status berikutnya |
|---|---|---|
| 1. GA Staff | `POST /api/ga-purchase-orders` | → `request ga manager` |
| 2. HRGA SPV/Manager | `PATCH /ga-manager/approve/:id` | `request ga manager` → `request director` |
| 3. Direktur | `PATCH /director/approve/:id` | `request director` → `request ar ap` |
| 4. AR/AP | `PATCH /ar-ap/approve/:id` | `request ar ap` → `request fat` |
| 5. Internal FAT SPV/Manager | `PATCH /fat/approve/:id` | `request fat` → `request cashier` |
| 6. Cashier | `PATCH /cashier/approve/:id` | `request cashier` → `request receiving` |
| 7. GA Staff | `PATCH /ga-staff/accept/:id` atau `/ga-staff/return/:id` | `request receiving` → `finished` atau `return request ga manager` |

Semua endpoint di atas berawalan `/api/ga-purchase-orders`. Penolakan memakai `/ga-manager/reject/:id`, `/director/reject/:id`, `/ar-ap/reject/:id`, `/fat/reject/:id`, atau `/cashier/reject/:id` dengan body `{ "note": "Alasan" }`, dan mengubah status menjadi `rejected ga manager`, `rejected director`, `rejected ar ap`, `rejected fat`, atau `rejected cashier`.

Pada tahap 6, kasir wajib mengirim data dan bukti pembayaran:

```json
{
  "payment_amount": 6660000,
  "payment_date": "2026-10-06",
  "payment_note": "Transfer BCA",
  "files_payment": []
}
```

Pada tahap 7, GA Staff mengunggah bukti pembelian (`files_purchase_proof`) dan form penerimaan barang (`files_goods_receipt`) beserta datanya (`received_date`, `receipt_note`). Data ini bisa disimpan bertahap lewat `PUT /api/ga-purchase-orders/:id/receiving` selama status `request receiving`, atau dikirim langsung bersama tombol accept/return.

- **Accepted** (`/ga-staff/accept/:id`): barang tidak bermasalah atau hanya perlu ditukar. `received_date`, minimal satu `files_purchase_proof`, dan minimal satu `files_goods_receipt` wajib ada; status menjadi `finished`.
- **Returned** (`/ga-staff/return/:id`): barang bermasalah dan perlu dikembalikan/order ulang. Body wajib berisi `note`. `return_count` bertambah satu dan alur pengembalian hanya melewati GA SPV/Manager, AR/AP, dan kasir memakai endpoint approve yang sama:
  `return request ga manager` → `return request ar ap` → `return request cashier` → `request receiving`.
  Di tahap kasir pada alur ini tidak perlu data pembayaran. Penolakan pada alur pengembalian mengembalikan status ke `request receiving` agar GA Staff memilih lagi. Direktur dan FAT tidak perlu menyetujui; riwayatnya tercatat di verification progress.

Setiap create, update, submit, approve, reject, accept, dan return membuat verification progress. Nilai `procurement_type` yang diterima: `Pengadaan Rutin`, `Pembaruan Stok`, `Pengadaan Baru`.

Untuk setiap array file (`files_product`, `files_attachment`, `file_attachment`, `files_payment`, `files_purchase_proof`, `files_goods_receipt`), item baru mengikuti format file proyek ini: `original_name`, `stored_name`, `url`, `mime_type`, dan `size`. Nama `indonesian_name` dan `mandarin_name` opsional; keduanya memakai `original_name` jika tidak diisi. Saat update, sertakan `id` file lama yang ingin dipertahankan.

## Inventory

Saat GA Staff menekan **Accepted** (`PATCH /api/ga-purchase-orders/ga-staff/accept/:id`), setiap item GA Purchase Order otomatis masuk ke inventory dalam transaksi yang sama.

- Jika sudah ada inventory dengan `item_name`, `brand`, `serial_number`, `size`, `material`, dan `other` yang sama persis, `quantity` item ditambahkan ke inventory tersebut. Field kosong (`null` atau string kosong) dianggap sama.
- Jika ada satu saja yang berbeda, dibuat data inventory baru.
- `files_product` dari item GA PO disalin ke inventory. File dengan `stored_name` yang sudah ada di inventory tersebut tidak disalin ulang.
- Setiap penambahan dicatat di `histories` (inventory, GA PO, item GA PO, user, quantity). Satu item GA PO hanya bisa menambah stok sekali.

Endpoint:

- `GET /api/inventories` dengan filter `search` (nama barang), `purchase_request_category`, `page`, dan `limit`. Response daftar hanya berisi `files_product`, tanpa `histories`.
- `GET /api/inventories/:id` menampilkan inventory beserta `files_product` dan `histories`.
