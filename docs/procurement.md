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
      "specification": "Laser, duplex",
      "quantity_unit": "unit",
      "quantity": 2,
      "procurement_type": "Pengadaan Baru",
      "average_usage": "100 pages/month",
      "remarks": "For operations",
      "product_link": "https://example.com/printer",
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
- `PATCH /api/ga-purchase-orders/ga-manager/approve/:id`: `request ga manager` → `request fat`.
- `PATCH /api/ga-purchase-orders/fat/approve/:id`: `request fat` → `request director`.
- `PATCH /api/ga-purchase-orders/director/approve/:id`: `request director` → `approved`.
- Untuk penolakan, gunakan endpoint `/ga-manager/reject/:id`, `/fat/reject/:id`, atau `/director/reject/:id`, selalu dengan body `{ "note": "Alasan" }`.

Setiap create, update, submit, approve, dan reject membuat verification progress. Nilai `procurement_type` yang diterima: `Pengadaan Rutin`, `Pembaruan Stok`, `Pengadaan Baru`.

Untuk setiap array file (`files_product`, `files_attachment`, `file_attachment`), item baru mengikuti format file proyek ini: `original_name`, `stored_name`, `url`, `mime_type`, dan `size`. Nama `indonesian_name` dan `mandarin_name` opsional; keduanya memakai `original_name` jika tidak diisi. Saat update, sertakan `id` file lama yang ingin dipertahankan.
