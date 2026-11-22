# Master Barang, Model Number, Serial Number, dan Kode Produk

Tracking perubahan isian item Purchase Request, good receipt GA Purchase Order, dan inventory. Semua endpoint berawalan `/api` dan butuh login.

## Progress

| Fase | Isi                                                                                                   | Status      |
| ---- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 1    | Master barang (tabel, CRUD, script sync)                                                              | Selesai     |
| 2    | Item PR + GAPO: `id_master_item`, `model_number` menggantikan `serial_number`, migrasi data lama       | Selesai     |
| 3    | Inventory: `id_master_item`, `model_number`, `product_code`, pencocokan baru, generator kode, cek serial unique, kosongkan serial lama | Selesai |
| 4    | Accept GAPO dengan 2 mode (dengan serial / tanpa serial)                                               | Selesai     |
| 5    | Return GAPO 2 langkah (draft receipt, edit/hapus draft, accept semua, return per unit atau per qty)    | Selesai     |
| 6    | Inventory request (master + 2 mode), movement (bawa kode), tampilan opname                             | Selesai     |
| 7    | Update docs terkait dan test                                                                           | Selesai     |

## Keputusan yang disepakati

| Topik                         | Keputusan                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Master barang                 | Global (tidak per company). `item_code` unik, 2-10 huruf besar/angka, `item_name`, `is_active`. Hapus = nonaktifkan                        |
| Ubah `item_code`              | Tidak bisa setelah dipakai item PR (409). `item_name` tetap bisa diubah                                                                     |
| Item PR                       | Semua item wajib pilih master, termasuk `services`. `item_name` disalin dari master. `serial_number` diganti `model_number`                 |
| Qty PR                        | Tetap boleh desimal. Bilangan bulat hanya wajib saat receipt mode serial                                                                    |
| Serial number                 | Diisi per unit saat good receipt GAPO, disimpan di inventory, ikut dicocokkan seperti `brand`, `size`, dll. Unik per master barang jika diisi (dicek terhadap inventory qty > 0 dan draft receipt lain) |
| Mode receipt                  | Dipilih per receipt. Dengan serial: serial wajib per unit, setiap unit jadi 1 baris inventory qty 1 dengan kode sendiri. Tanpa serial: qty saja, 1 baris dengan 1 kode (seperti alur sekarang) |
| Kode produk                   | Format `KODE-00001`, dibuat saat masuk inventory (bukan di receipt). Urutan = nomor terbesar kode barang itu di inventory + 1. Tidak dipakai ulang |
| Accept                        | Tetap harus seluruh qty tersisa sekaligus                                                                                                   |
| Return                        | Simpan draft receipt dulu (belum masuk inventory, bisa diedit/dihapus), lalu Accept semua atau Return. Mode serial pilih unit, mode tanpa serial isi `quantity_returned`. Sisanya masuk inventory |
| Draft receipt                 | Selama ada draft, aksi lain untuk item itu diblok                                                                                           |
| Inventory request             | Pakai master + `model_number` + 2 mode yang sama                                                                                            |
| Movement                      | Mekanisme tetap. Baris tujuan baru membawa `product_code`, `id_master_item`, `model_number`. Stock Transfer memilih baris sumber dari `GET /api/inventories` (filter lokasi + `search` kode/serial), tidak lagi lewat `check-stock`                                                 |
| Opname                        | Logika tetap, response menampilkan field baru. Hanya baris inventory qty > 0 yang di-opname                                                 |
| Data lama                     | Serial lama di item PR/GAPO dipindah ke `model_number`. Serial lama di inventory dikosongkan (backup DB dulu). Inventory lama tanpa kode dibiarkan. Receipt lama tetap |
| `GET /inventories/check-stock` | Tidak disesuaikan dengan alur baru (tidak dipakai saat ini)                                                                                |

## Setup

Jalankan sekali setelah deploy: `npm run db:sync-master-item` (aman dijalankan ulang). Script ini, di DB1 dan DB2:

1. Membuat tabel `master_items`.
2. Menambah kolom `id_master_item` dan `model_number` di `purchase_request_items` dan `ga_purchase_order_items`.
3. Memindah nilai `serial_number` lama kedua tabel itu ke `model_number`, lalu mengosongkan `serial_number`. Kolom `serial_number` dibiarkan ada (tidak dipakai lagi) dan bisa di-drop manual nanti.
4. Menambah kolom `id_master_item`, `product_code`, dan `model_number` di `inventories`, plus index `product_code` dan `(id_master_item, serial_number)`.
5. Menambah kolom `has_serial_number` di `ga_purchase_order_item_receipts`, membuat tabel `ga_purchase_order_item_receipt_units`, dan mengubah index unik `inventory_histories.id_ga_purchase_order_item_receipt` menjadi index biasa (receipt dengan serial membuat satu history per unit). `npm run db:sync-ga-purchase-order` juga sudah disesuaikan agar tidak membuat index unik itu lagi.
6. Menambah nilai `draft` di kolom `ga_purchase_order_item_receipts.type` dan kolom baru `return_note`.
7. Menambah kolom `id_master_item`, `model_number`, dan `has_serial_number` di `inventory_requests` (nilai `serial_number` lama dipindah ke `model_number`, seperti langkah 3), membuat tabel `inventory_request_units`, dan menambah kolom `product_code` dan `model_number` di `inventory_opname_items`.
8. **Hanya jika dijalankan dengan flag** `npm run db:sync-master-item -- --clear-inventory-serial`: mengosongkan `serial_number` inventory lama (baris tanpa `id_master_item`). **Tidak bisa dibatalkan, backup DB1 dan DB2 dulu.** Baris yang memakai master barang tidak pernah disentuh, jadi aman walau flag dipakai lagi. Baris lama yang setelah dikosongkan menjadi sama persis tetap dibiarkan sebagai baris terpisah.

Fase 2 dan fase 3 sebaiknya di-deploy bersamaan: tanpa fase 3, stok dari GA PO masuk inventory tanpa `model_number`. Sampai fase 4 selesai, stok dari GA PO masuk tanpa serial number.

## Fase 1: Master barang

Tabel `master_items`. Panduan frontend: [master-item-frontend.md](master-item-frontend.md).

| Aksi   | Method & endpoint              | Keterangan                                                          |
| ------ | ------------------------------ | ------------------------------------------------------------------- |
| List   | `GET /api/master-items`        | Filter `search` (kode atau nama), `page`, `limit`. Hanya yang aktif |
| Detail | `GET /api/master-items/:id`    |                                                                     |
| Buat   | `POST /api/master-items`       | `item_code` dan `item_name` wajib                                   |
| Edit   | `PUT /api/master-items/:id`    | Kirim field yang diubah saja                                        |
| Hapus  | `DELETE /api/master-items/:id` | Nonaktifkan                                                         |

```json
{ "item_code": "LTP", "item_name": "Laptop" }
```

`item_code` di-trim dan diubah ke huruf besar sebelum disimpan (`ltp` → `LTP`).

Response:

```json
{ "id": 1, "item_code": "LTP", "item_name": "Laptop", "is_active": true, "createdAt": "...", "updatedAt": "..." }
```

Pesan error:

| HTTP | Pesan                                                | Kapan                                                  |
| ---- | ---------------------------------------------------- | ------------------------------------------------------ |
| 400  | `item_code is required`, `item_name is required`     | Field kosong                                           |
| 400  | `item_code must be 2-10 uppercase letters or digits` | Format kode salah (mis. `L`, `LTP-01`, ada spasi)      |
| 409  | `item_code ... already exists`                       | Kode sudah dipakai, termasuk master yang dinonaktifkan |
| 409  | `item_code cannot be changed once the master item is used by a purchase request` | Ubah kode master yang sudah dipakai item PR |
| 404  | `Master item not found`                              | Detail/edit/hapus master yang tidak ada atau nonaktif  |

## Fase 2: Item Purchase Request dan GA Purchase Order

### Item Purchase Request

`POST /api/purchase-requests` dan `PUT /api/purchase-requests/:id`, per item:

| Field                | Status                    | Keterangan                                                                                    |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `id_master_item`     | **Baru, wajib**           | Master barang aktif. Berlaku juga untuk item `services`                                        |
| `model_number`       | **Baru, opsional**        | Model barang, mis. `M404dn`                                                                    |
| `item_name`          | Berubah                   | Tidak dikirim lagi; selalu disalin dari master. Nilai dalam body diabaikan                     |
| ~~`serial_number`~~  | **Dihapus**               | Diganti `model_number`. Serial number diisi per unit saat good receipt GA PO (fase 4)          |

```json
{
  "id_master_item": 3,
  "brand": "HP",
  "model_number": "M404dn",
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
```

Saat edit dengan `items`, setiap item (termasuk item lama yang dipertahankan dengan `id`) harus mengirim `id_master_item`. Qty tetap boleh desimal.

Response item (`GET /api/purchase-requests`, `GET /:id`, `GET /to-process-ga-order`) berisi `id_master_item`, `model_number`, dan `master_item: { id, item_code, item_name }`. Item lama berisi `id_master_item: null` dan `master_item: null`.

### Item GA Purchase Order

Tidak ada perubahan body. `id_master_item`, `item_name`, dan `model_number` disalin dari item PR. Response item berisi `master_item: { id, item_code, item_name }`. ~~`serial_number`~~ item GA PO **dihapus**, diganti `model_number`.

### Pesan error

| HTTP | Pesan                                    | Kapan                                         |
| ---- | ---------------------------------------- | --------------------------------------------- |
| 400  | `items[i].id_master_item is required`    | `id_master_item` kosong atau bukan angka > 0  |
| 400  | `items[i].model_number must be a string` | `model_number` bukan teks                     |
| 404  | `Master item ... not found`              | Master tidak ada atau sudah dinonaktifkan     |

## Fase 3: Inventory

### Kolom baru

| Field            | Isi                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `id_master_item` | Master barang. `null` untuk inventory lama                                                                   |
| `product_code`   | Kode produk `KODE-00001`. `null` untuk inventory lama dan barang tanpa master                                |
| `model_number`   | Model barang, disalin dari item GA PO                                                                        |
| `serial_number`  | Tetap ada. Sekarang diisi per unit dari good receipt (fase 4). Baris yang punya serial selalu berisi qty 1   |

`GET /api/inventories` dan `GET /api/inventories/:id` sekarang mengembalikan `id_master_item`, `product_code`, `model_number`, dan `master_item: { id, item_code, item_name }`.

`GET /api/inventories` menerima filter baru `id_master_item`. `search` sekarang mencari di `item_name`, `product_code`, `serial_number`, dan `model_number` (sebagian kata juga cocok).

### Pencocokan stok

Stok masuk ditambahkan ke baris inventory yang sudah ada jika semua ini sama persis (kosong dan `null` dianggap sama):

| Barang                                                                       | Spesifikasi                                                                  | Tempat                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| `id_master_item` (nama boleh beda, jadi rename master tidak memecah stok)    | `brand`, `model_number`, `serial_number`, `size`, `material`, `other`        | `id_company`, `id_inventory_location` |
| Barang tanpa master (data lama, inventory request): `item_name`, dengan `id_master_item` kosong | sama                                                     | sama                                |

Kalau tidak ada yang cocok, dibuat baris baru. Akibatnya:

- 3 laptop dengan spesifikasi sama tapi serial berbeda → 3 baris (qty 1), 3 kode, dan tampil 3 baris di opname dan movement.
- Barang tanpa serial dengan spesifikasi sama → 1 baris dengan qty bertambah dan 1 kode.
- Barang dengan master tidak pernah tergabung dengan inventory lama tanpa master.

### Kode produk

- Dibuat saat **baris inventory baru** dibuat untuk barang dengan master. Menambah qty ke baris yang sudah ada tidak membuat kode baru.
- Nomor berikutnya = nomor terbesar `KODE-xxxxx` yang sudah ada di inventory untuk kode barang itu + 1, minimal 5 digit (`LTP-00001`, ..., `LTP-99999`, `LTP-100000`). Urutan berlaku global untuk semua company dan lokasi.
- Kode tidak pernah dipakai ulang karena baris inventory tidak dihapus (qty 0 tetap ada).
- Baris tujuan movement yang baru **membawa kode baris sumber**, jadi kode yang sama bisa ada di beberapa lokasi (untuk barang tanpa serial yang dipindah sebagian).
- Inventory lama tanpa master tetap tanpa kode.

### Serial number unik

Serial yang diisi harus unik per master barang: tidak boleh dobel dalam satu input, dan tidak boleh sudah dipegang baris inventory master yang sama dengan qty > 0. Pengecekan ini dipakai di good receipt mulai fase 4, dan terhadap draft receipt lain mulai fase 5.

| HTTP | Pesan                                                      | Kapan                                              |
| ---- | ---------------------------------------------------------- | -------------------------------------------------- |
| 400  | `serial_number ... is duplicated`                          | Serial yang sama dikirim dua kali                  |
| 409  | `serial_number ... already exists in inventory (LTP-00002)` | Serial sudah ada di stok untuk master barang itu   |

### `GET /api/inventories/check-stock`

Tidak diubah: tetap mencocokkan `item_name`, `brand`, `serial_number`, `size`, `material`, `other`, `id_company`, `id_inventory_location`, dan mengabaikan `id_master_item` dan `model_number`. Untuk barang dengan master, hasilnya bisa menunjuk baris yang berbeda model. Lihat catatan inventory movement di fase 6.

## Fase 4: Accept GA PO dengan 2 mode

`PATCH /api/ga-purchase-orders/ga-staff/accept/:id/items/:itemId`. Accepted tetap menerima **seluruh qty tersisa** sekaligus. Mode dipilih per penerimaan:

| Field               | Mode tanpa serial (default)                     | Mode dengan serial                                                                |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `has_serial_number` | `false` atau tidak dikirim                      | `true` (harus boolean)                                                            |
| `units`             | Diabaikan                                       | Wajib, tepat 1 per unit qty tersisa: `[{ "serial_number": "SN-001" }, ...]`       |
| Syarat              | -                                               | `item_category` = `item`, qty tersisa bilangan bulat, serial wajib dan unik       |
| Masuk inventory     | 1 qty, 1 baris (atau ditambah ke baris yang cocok), 1 kode | Setiap unit 1 baris qty 1, kode sendiri (`LTP-00005`, `LTP-00006`, ...) |

Field lain sama seperti sebelumnya (`goods_in_date`, `goods_status`, `note`, `files_goods_in`, `files_goods_receipt`). ~~`quantity_good`~~ di body Accepted **dihapus**: nilainya diabaikan, receipt mencatat `quantity_good` = qty tersisa.

```json
{
  "has_serial_number": true,
  "units": [{ "serial_number": "SN-001" }, { "serial_number": "SN-002" }, { "serial_number": "SN-003" }],
  "goods_in_date": "2026-11-20",
  "goods_status": "Good Without Exception",
  "files_goods_in": [],
  "files_goods_receipt": []
}
```

Response: setiap receipt (`items[].receipts[]`) berisi `has_serial_number` dan `units[]`: `id`, `serial_number`, `is_returned`, `id_inventory`, `inventory: { id, product_code }`. Receipt tanpa serial berisi `units: []`. Setiap unit tercatat di `histories` inventory-nya masing-masing (satu history per unit, semuanya menunjuk receipt yang sama).

Accepted langsung ditolak (409) jika item punya draft good receipt (fase 5).

| HTTP | Pesan                                                                              | Kapan                                            |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| 400  | `has_serial_number must be a boolean`                                              | Dikirim selain `true`/`false`                    |
| 400  | `units must have N entries, one serial number per unit`                            | Jumlah `units` tidak sama dengan qty tersisa     |
| 400  | `units[i].serial_number is required`                                               | Serial kosong                                    |
| 400  | `The outstanding quantity (2.5) must be a whole number to receive with serial numbers` | Qty tersisa desimal                          |
| 400  | `has_serial_number is only allowed for item_category item`                         | Item `services`                                  |
| 400  | `serial_number ... is duplicated`                                                  | Serial sama dua kali dalam satu penerimaan       |
| 409  | `serial_number ... already exists in inventory (LTP-00002)`                        | Serial sudah ada di stok master barang itu       |

## Fase 5: Return 2 langkah

Semua endpoint berawalan `/api/ga-purchase-orders`. Receipt baru punya `type`: `draft` (tersimpan, belum masuk inventory), `accept`, atau `return`.

| Langkah | Endpoint | Body | Hasil |
| ------- | -------- | ---- | ----- |
| 1. Simpan good receipt | `PATCH /ga-staff/receipt/:id/items/:itemId` | Sama seperti Accepted: `has_serial_number`, `units`, `goods_in_date`, `goods_status`, `note`, `files_goods_in`, `files_goods_receipt` | Draft untuk seluruh qty tersisa. Belum masuk inventory, status item tidak berubah |
| Edit draft | `PATCH /ga-staff/receipt/:id/items/:itemId` (lagi) | Sama | Draft yang sama diubah; `units` diganti semua; file pertahankan dengan `id` |
| Hapus draft | `DELETE /ga-staff/receipt/:id/items/:itemId` | - | Draft, unit, dan filenya dihapus |
| 2a. Accepted semua | `PATCH /ga-staff/receipt/accept/:id/items/:itemId` | - | Semua masuk inventory, item `accepted` |
| 2b. Returned | `PATCH /ga-staff/return/:id/items/:itemId` | Lihat di bawah | Yang dipilih dikirim balik, sisanya masuk inventory, item `returned` |

Body Returned:

| Field | Draft dengan serial | Draft tanpa serial |
| ----- | ------------------- | ------------------ |
| `returned_unit_ids` | Wajib, minimal 1 `id` dari `receipts[].units[]` draft itu | Diabaikan |
| `quantity_returned` | Diabaikan (= jumlah unit dipilih) | Wajib, > 0, tidak boleh melebihi qty draft |
| `note` | Wajib (alasan return, disimpan di `return_note`) | sama |
| `return_delivery_date`, `return_shipping_cost`, `files_return_delivery_proof`, `files_return_waybill` | Wajib | sama |

```json
{
  "returned_unit_ids": [305],
  "note": "Layar retak",
  "return_delivery_date": "2026-11-21",
  "return_shipping_cost": 25000,
  "files_return_delivery_proof": [],
  "files_return_waybill": []
}
```

Aturan:

- Selama item punya draft, **Accepted langsung** dan **ajukan refund** ditolak (409) sampai draft di-accept, di-return, atau dihapus. Simpan purchase realization tetap bisa.
- Serial di draft tidak boleh sudah ada di inventory (qty > 0) atau di draft lain untuk master barang yang sama. Saat Accepted semua / Returned, serial unit yang akan masuk inventory dicek lagi terhadap inventory.
- Unit yang di-return ditandai `is_returned: true` dan tidak pernah masuk inventory. Barang pengganti diterima lewat receipt baru (Accepted langsung, atau draft lagi jika ada yang harus dikembalikan lagi) dengan serial dan kode baru. Refund tetap seperti sebelumnya (menutup seluruh `quantity_returned` item).
- Receipt baru mencatat `quantity_good` = qty yang masuk inventory dari receipt itu. Receipt return lama tetap berisi `quantity_good` hasil pemeriksaan.
- ~~Returned satu langkah~~ (data penerimaan + data return sekaligus, termasuk `quantity_good`) **dihapus**.

Verification progress per item baru: `goods receipt saved`, `goods receipt updated`, `goods receipt deleted`.

| HTTP | Pesan | Kapan |
| ---- | ----- | ----- |
| 409 | `The item has no draft goods receipt; save the goods receipt first` | Returned / Accepted semua tanpa draft |
| 404 | `The item has no draft goods receipt` | Hapus draft yang tidak ada |
| 409 | `The item has a draft goods receipt; accept, return or delete it first` | Accepted langsung / ajukan refund saat ada draft |
| 409 | `The outstanding quantity changed; save the goods receipt again` | Qty tersisa berubah sejak draft disimpan |
| 409 | `serial_number ... is already in another draft goods receipt` | Serial dipakai draft lain (master barang sama) |
| 400 | `returned_unit_ids must list at least one unit of the goods receipt` | Draft dengan serial, `returned_unit_ids` kosong |
| 400 | `returned_unit_ids contains an invalid or duplicate unit ...` | Unit bukan milik draft atau dobel |
| 400 | `quantity_returned must not exceed the received quantity (N)` | Draft tanpa serial |

## Fase 6: Inventory request, movement, dan opname

### Inventory request

`POST /api/inventory-requests`, `POST /api/inventory-requests/bulk`, `PUT /api/inventory-requests/:id`. Detail untuk frontend: [inventory-request-frontend.md](inventory-request-frontend.md).

| Field | Status | Keterangan |
| ----- | ------ | ---------- |
| `id_master_item` | **Baru, wajib saat create** | Master barang aktif. `item_name` disalin dari master |
| `model_number` | **Baru, opsional** | Model barang |
| `has_serial_number` | **Baru** | `true` / `false` (default `false`) |
| `units` | **Baru** | Wajib jika `has_serial_number: true`: tepat 1 `serial_number` per unit `quantity` (bilangan bulat) |
| ~~`item_name`~~ | **Dihapus dari body** | Diabaikan; disalin dari master |
| ~~`serial_number`~~ | **Dihapus** | Diganti `model_number` (nilai lama dipindah oleh script). Serial sekarang per unit lewat `units` |

- Serial dicek unik per master barang terhadap stok (qty > 0), draft good receipt GA PO, dan inventory request `pending` lain. Draft good receipt GA PO sekarang juga dicek terhadap inventory request `pending`.
- Edit: jika `quantity`, `has_serial_number`, `units`, atau `id_master_item` dikirim untuk request dengan serial, `units` lengkap wajib dikirim dan menggantikan unit lama. `has_serial_number: false` menghapus semua unit.
- Approve tanpa serial: seperti sebelumnya, `id_inventory` request terisi. Approve dengan serial: serial dicek lagi terhadap stok, setiap unit menjadi baris inventory sendiri (qty 1, kode sendiri), `units[].id_inventory` terisi, dan `id_inventory` request tetap `null`.
- Stok dari inventory request sekarang memakai pencocokan yang sama dengan GA PO (master barang + spesifikasi), jadi bisa tergabung dengan stok GA PO dan mendapat kode produk.
- Request lama tanpa master barang tetap bisa di-approve: dicocokkan dengan `item_name` ke inventory lama tanpa master, tanpa kode.
- Response berisi `master_item: { id, item_code, item_name }`, `units[]` (`id`, `serial_number`, `id_inventory`, `inventory: { id, product_code }`), dan `inventory` dengan `product_code`.

### Inventory movement

- Tidak ada perubahan body maupun alur approval. Baris dengan serial number (satu unit) hanya bisa dipindah utuh: `quantity` harus sama dengan stok baris itu, kalau tidak ditolak (400) `A unit with a serial number moves as a whole: quantity must be 1`. Baris tujuan yang baru membawa `product_code`, `id_master_item`, `model_number`, dan `serial_number` baris sumber (sudah sejak fase 3).
- `inventory_source` dan `inventory_destination` di response sekarang berisi `id_master_item`, `product_code`, dan `model_number`.
- Stock Transfer memilih baris sumber dari `GET /api/inventories` (filter company + lokasi, `search` kode/serial/model), tidak lagi lewat `check-stock`. Detail: [inventory-movement-frontend.md](inventory-movement-frontend.md).

### Stock opname

- Item opname sekarang juga menyalin `product_code` dan `model_number` dari inventory saat opname dibuat. Opname lama berisi `null` untuk keduanya.
- `GET /api/inventory-opnames/:id/items?search=...` sekarang juga mencari `product_code`, `serial_number`, dan `model_number`.
- Opname hanya mengambil baris inventory dengan **qty > 0**, baik dengan maupun tanpa serial. Baris qty 0 (unit yang sudah pindah, barang habis) tidak ikut; barang yang ternyata masih ada dicatat lewat inventory request.
- Logika hitung dan approval tidak berubah. Barang dengan serial muncul satu baris per unit (qty sistem 1).

### Baris inventory qty 0

Baris qty 0 **tidak dinonaktifkan** (tidak ada kolom aktif/nonaktif): baris itu bisa terisi lagi (unit kembali ke lokasi asal, stok baru dengan spesifikasi sama), dan history serta kode produknya tetap dipakai. Sebagai gantinya, baris disaring berdasarkan qty:

- Opname: hanya qty > 0.
- `GET /api/inventories?in_stock=true`: hanya qty > 0. Tanpa filter ini semua baris tetap tampil. Dipakai untuk pilihan baris sumber movement dan daftar stok.
- Detail inventory (`GET /api/inventories/:id`) dan history tetap bisa dibuka untuk baris qty 0.

## Fase 7: Review akhir

- Semua test dijalankan tanpa koneksi database (host DB diarahkan ke alamat palsu), termasuk test baru: master barang, kode produk, baris per serial, accept 2 mode, draft good receipt dan return per unit/qty, inventory request dengan serial, movement unit ber-serial, dan opname qty > 0.
- Ditemukan dan diperbaiki saat review: unit ber-serial bisa dipindah sebagian lewat movement (mis. qty 0.5). Sekarang ditolak.
- Docs yang diperbarui: [procurement.md](procurement.md), [ga-purchase-order-status.md](ga-purchase-order-status.md), [inventory-request-frontend.md](inventory-request-frontend.md), [inventory-movement-frontend.md](inventory-movement-frontend.md), [inventory-opname-frontend.md](inventory-opname-frontend.md), [inventory-location.md](inventory-location.md).

### Langkah deploy

1. Deploy fase 1-6 bersamaan (perubahan saling bergantung).
2. Backup DB1 dan DB2.
3. `npm run db:sync-master-item`.
4. Jika serial number inventory lama mau dikosongkan: `npm run db:sync-master-item -- --clear-inventory-serial`.
5. Isi master barang (`POST /api/master-items`) sebelum user membuat Purchase Request atau inventory request baru.
6. Frontend menyesuaikan: pilih master barang dan `model_number` di form PR dan inventory request; form good receipt 2 mode; return 2 langkah (draft lalu accept semua / return); Stock Transfer memilih baris dari `GET /api/inventories?in_stock=true`.

### Belum ditangani

- `GET /api/inventories/check-stock` belum mengenal master barang dan `model_number` (sesuai keputusan, tidak dipakai saat ini).
- Opname tidak membatasi `quantity_actual` baris dengan serial number (hitungan 2 untuk satu unit ber-serial masih diterima). Diputuskan tidak dibatasi.
