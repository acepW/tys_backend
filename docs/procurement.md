# Purchase Request dan GA Purchase Order

`scripts/procurement-schema.sql` dipakai untuk instalasi manual pada database baru. Pada database yang sudah berisi status dengan underscore, jalankan `node scripts/migrate-procurement-status-spaces.js` untuk memperbarui DB1 dan DB2. SQL migrasinya ada di `scripts/procurement-status-spaces.sql`. `server.js` memiliki opsi `syncProcurementModels()` untuk membuat tabel yang belum ada; `sync({ alter: false })` tidak mengubah enum tabel lama.
Semua endpoint memakai autentikasi yang sama dengan modul lain.

## Nomor dokumen

- `GET /api/purchase-requests/no/documents` mengembalikan `no_purchase_request`, contoh `PUR-TYSCG-2026-0001`.
- `GET /api/ga-purchase-orders/no/documents` mengembalikan `no_ga_purchase_order`, contoh `GAPO-TYSCG-10-2026-0001` (bulan-tahun, 4 digit; nomor urut tetap dihitung per perusahaan per tahun).
- Nomor berurut per perusahaan dan tahun berdasarkan dokumen yang sudah dibuat. Kirim nomor tersebut saat create. Kolom nomor memiliki unique constraint.

## Purchase Request

`POST /api/purchase-requests`:

```json
{
  "purchase_request_no": "PUR-TYSCG-2026-0001",
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
      "item_category": "item",
      "remarks": "For operations",
      "files_product": []
    }
  ]
}
```

`item_category` wajib diisi per item dengan nilai `item` atau `services`. `id_user_request` dan `id_requester` pada setiap item selalu diambil dari user login; nilai keduanya dalam body diabaikan. `id_department` dan `id_division` memakai data user login jika tidak dikirim. `purchase_request_category` item selalu mengikuti header.

- `GET /api/purchase-requests` dan `GET /api/purchase-requests/:id` menampilkan item, file, dan verification progress. Daftar dapat difilter dengan `id_company`, `id_department`, `id_division`, `status`, dan `purchase_request_category`.
- `PUT /api/purchase-requests/:id` mengubah draft `pending` milik pembuat. Jika `items` dikirim, daftar itu menggantikan daftar lama; sertakan `id` item untuk mempertahankannya. Jika `items` tidak dikirim, daftar lama dipertahankan.
- `PATCH /api/purchase-requests/request-manager/:id`: `pending` → `request manager`.
- `PATCH /api/purchase-requests/manager/approve/:id`: `request manager` → `request ga`.
- `PATCH /api/purchase-requests/manager/reject/:id`: body `{ "note": "Alasan" }` → `rejected manager`.
- `PATCH /api/purchase-requests/ga/approve/:id`: semua item harus mendapat keputusan dan `asset_category` (`asset` atau `non asset`); minimal satu disetujui:

```json
{
  "note": "Diperiksa GA",
  "item_decisions": [
    { "id_purchase_request_item": 11, "decision": "approved", "asset_category": "asset" },
    { "id_purchase_request_item": 12, "decision": "rejected", "asset_category": "non asset" }
  ]
}
```

- `PATCH /api/purchase-requests/ga/reject/:id`: body `{ "note": "Alasan" }` menolak seluruh item.
- `GET /api/purchase-requests/to-process-ga-order` menampilkan item yang disetujui GA dan belum masuk order. Bisa difilter dengan `id_company`.

## GA Purchase Order

`POST /api/ga-purchase-orders` memakai item yang tersedia pada endpoint `to-process-ga-order`. Detail barang, pemohon, kategori, pengadaan, `item_category`, dan `asset_category` disalin dari Purchase Request. `id_company` diturunkan dari item sumber; semua item dalam satu order harus berasal dari perusahaan yang sama.

```json
{
  "ga_purchase_order_no": "GAPO-TYSCG-10-2026-0001",
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
| 3. Direktur | `PATCH /director/approve/:id` | `request director` → `request spv/manager fat` |
| 4. Internal FAT SPV/Manager | `PATCH /fat/approve/:id` | `request spv/manager fat` → `request cashier` |
| 5. Cashier | `PATCH /cashier/approve/:id` | `request cashier` → `request receiving` |
| 6. GA Staff (per item) | `PATCH /ga-staff/accept/:id/items/:itemId` atau `/ga-staff/return/:id/items/:itemId` | `request receiving` → `finished` setelah semua item accepted |

Semua endpoint di atas berawalan `/api/ga-purchase-orders`. Penolakan memakai `/ga-manager/reject/:id`, `/director/reject/:id`, `/fat/reject/:id`, atau `/cashier/reject/:id` dengan body `{ "note": "Alasan" }`, dan mengubah status menjadi `rejected ga manager`, `rejected director`, `rejected spv/manager fat`, atau `rejected cashier`.

Pada tahap 5, kasir wajib mengirim data dan bukti pembayaran:

```json
{
  "payment_amount": 6660000,
  "payment_date": "2026-10-06",
  "payment_method": "petty cash",
  "petty_cash_method": "transfer",
  "payment_note": "Transfer BCA",
  "files_payment": []
}
```

`payment_method` wajib: `petty cash` atau `bank`. `petty_cash_method` (`cash` atau `transfer`) wajib jika `payment_method` = `petty cash`; untuk `bank` nilainya disimpan `null`.

Pada tahap 6, GA Staff memproses **setiap item** secara terpisah. Setiap item punya `receiving_status`: `pending` → `returned` / `accepted`.

- **Accepted** (`PATCH /ga-staff/accept/:id/items/:itemId`): semua field berikut wajib, termasuk minimal satu file di setiap kategori file.

```json
{
  "purchase_realization_date": "2026-10-10",
  "purchase_realization_amount": 3330000,
  "goods_in_date": "2026-10-12",
  "goods_status": "Good With Notes",
  "note": "Dus penyok (opsional)",
  "files_purchase_proof": [],
  "files_invoice": [],
  "files_goods_in": [],
  "files_goods_receipt": []
}
```

  `goods_status`: `Good Without Exception`, `Good With Notes`, `Not Good Refund`, atau `Not Good Returned`. Item dengan `item_category` = `item` langsung masuk inventory; item `services` tidak. Item yang sudah accepted tidak bisa di-accept atau di-return lagi.
- **Returned** (`PATCH /ga-staff/return/:id/items/:itemId`): body cukup `{ "note": "Alasan" }` (wajib). Item menjadi `returned`, `return_count` item bertambah satu, dan item menunggu di-accept lagi. Status order tidak berubah.
- Begitu semua item `accepted`, status order otomatis menjadi `finished`.

Accept dan return per item tercatat di verification progress dengan `id_ga_purchase_order_item` (beserta `ga_purchase_order_item.item_name`).

Order lama yang masih berstatus `return request ga manager` / `return request cashier` (alur return lama) tetap bisa diselesaikan lewat endpoint approve/reject GA Manager dan kasir, lalu kembali ke `request receiving`.

Setiap create, update, submit, approve, reject, accept, dan return membuat verification progress. Nilai `procurement_type` yang diterima: `Pengadaan Rutin`, `Pembaruan Stok`, `Pengadaan Baru`.

Untuk setiap array file (`files_product`, `files_attachment`, `file_attachment`, `files_payment`, `files_purchase_proof`, `files_invoice`, `files_goods_in`, `files_goods_receipt`), item baru mengikuti format file proyek ini: `original_name`, `stored_name`, `url`, `mime_type`, dan `size`. Nama `indonesian_name` dan `mandarin_name` opsional; keduanya memakai `original_name` jika tidak diisi. Saat update, sertakan `id` file lama yang ingin dipertahankan.

## Inventory

Saat GA Staff menekan **Accepted** pada sebuah item (`PATCH /api/ga-purchase-orders/ga-staff/accept/:id/items/:itemId`), item tersebut otomatis masuk ke inventory dalam transaksi yang sama, **hanya jika** `item_category` = `item`.

- Jika sudah ada inventory dengan `item_name`, `brand`, `serial_number`, `size`, `material`, dan `other` yang sama persis, `quantity` item ditambahkan ke inventory tersebut. Field kosong (`null` atau string kosong) dianggap sama.
- Jika ada satu saja yang berbeda, dibuat data inventory baru.
- `asset_category` item GA PO disimpan di inventory baru. Untuk inventory yang sudah ada, `asset_category` hanya diisi jika masih kosong.
- `files_product` dari item GA PO disalin ke inventory. File dengan `stored_name` yang sudah ada di inventory tersebut tidak disalin ulang.
- Setiap penambahan dicatat di `histories` (inventory, GA PO, item GA PO, user, quantity). Satu item GA PO hanya bisa menambah stok sekali.

Endpoint:

- `GET /api/inventories` dengan filter `search` (nama barang), `purchase_request_category`, `asset_category`, `page`, dan `limit`. Response daftar hanya berisi `files_product`, tanpa `histories`.
- `GET /api/inventories/:id` menampilkan inventory beserta `files_product` dan `histories`.
Inventory hanya bertambah lewat dua jalur: item GA PO yang di-accept (di atas), dan inventory request yang sudah di-approve (di bawah). Tidak ada lagi endpoint `POST /api/inventories` untuk menambah stok langsung.

- `GET /api/inventories/check-stock?item_name=Printer&brand=HP&serial_number=M404dn&size=&material=&other=` mengembalikan stok inventory yang `item_name`, `brand`, `serial_number`, `size`, `material`, dan `other`-nya sama persis (field kosong atau tidak dikirim dianggap kosong). `item_name` wajib. Jika tidak ada yang cocok, response `{ "id_inventory": null, "quantity": 0, "quantity_unit": null }`.

## Inventory Request (input stok manual dengan approval)

Input stok manual dibuat sebagai request satu barang per request, lalu di-approve satu kali. Siapa yang boleh approve diatur di approval flow dengan `approval_for` = `inventory request` dan status `pending`. Status request: `pending` → `approve` atau `reject`.

`POST /api/inventory-requests`:

```json
{
  "item_name": "Printer",
  "brand": "HP",
  "serial_number": "M404dn",
  "size": "A4",
  "material": "Plastic",
  "other": "Laser",
  "purchase_request_category": "Office Equipment",
  "asset_category": "asset",
  "quantity_unit": "unit",
  "quantity": 2,
  "note": "Stok awal",
  "files_product": []
}
```

`item_name`, `quantity_unit`, dan `quantity` (> 0) wajib. `asset_category` opsional (`asset` / `non asset`).

- `GET /api/inventory-requests` (filter `search`, `status`, `page`, `limit`) dan `GET /api/inventory-requests/:id` menampilkan request, `files_product`, `inventory` (setelah approve), dan `verification_progress`, plus `is_can_approve_reject` dan `action_label` seperti fitur approval lain.
- `PUT /api/inventory-requests/:id`: hanya pembuat, hanya selama `pending`. Kirim field yang ingin diubah saja. Untuk `files_product`, sertakan `id` file lama yang ingin dipertahankan.
- `PATCH /api/inventory-requests/approve/:id` (body `{ "note": "..." }` opsional): stok ditambahkan ke inventory dengan aturan pencocokan yang sama seperti GA PO, `files_product` disalin, history dicatat dengan `id_inventory_request`, dan `id_inventory` request diisi.
- `PATCH /api/inventory-requests/reject/:id`: body `{ "note": "Alasan" }` wajib. Stok tidak berubah.
- Request yang sudah `approve` atau `reject` tidak bisa diedit, di-approve, atau di-reject lagi (409).
