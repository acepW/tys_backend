# Panduan Frontend: Master Barang

Master barang berisi daftar barang yang boleh dipesan dan disimpan, misalnya `LTP` - Laptop. Semua endpoint berawalan `/api` dan memakai cookie login yang sama seperti endpoint lain.

## Konsep singkat

- Satu master barang = **kode barang** (`item_code`) + **nama barang** (`item_name`).
- Master barang berlaku untuk **semua company**.
- Dipakai di:
  - Form item **Purchase Request**: field `id_master_item` wajib, menggantikan input nama barang.
  - Form **inventory request**: field `id_master_item` wajib.
- `item_name` di PR, GA PO, inventory request, dan inventory selalu **disalin dari master**, jadi frontend tidak perlu mengirim nama barang lagi.
- `item_code` menjadi awalan **kode produk** di inventory, misalnya `LTP-00001`. Kode produk dibuat otomatis oleh backend saat barang masuk inventory.
- Hapus master barang **hanya menonaktifkan**. Master yang nonaktif tidak muncul di list dan tidak bisa dipilih untuk PR atau inventory request baru, tapi data lama yang memakainya tetap utuh.

## Endpoint

| Aksi   | Method & endpoint              | Keterangan                                                          |
| ------ | ------------------------------ | ------------------------------------------------------------------- |
| List   | `GET /api/master-items`        | Hanya yang aktif. Filter: `search` (kode atau nama), `page`, `limit` |
| Detail | `GET /api/master-items/:id`    | Hanya yang aktif                                                    |
| Buat   | `POST /api/master-items`       |                                                                     |
| Edit   | `PUT /api/master-items/:id`    | Kirim field yang diubah saja                                        |
| Hapus  | `DELETE /api/master-items/:id` | Menonaktifkan                                                       |

## 1. Form buat master barang

`POST /api/master-items`

```json
{ "item_code": "LTP", "item_name": "Laptop" }
```

| Field       | Wajib | Isi                                                                                       |
| ----------- | ----- | ----------------------------------------------------------------------------------------- |
| `item_code` | Ya    | 2-10 huruf dan/atau angka, tanpa spasi atau tanda baca (`-`, `_`, dll). Unik               |
| `item_name` | Ya    | Nama barang                                                                               |

Catatan form:

- `item_code` disimpan dalam **huruf besar**: `ltp` disimpan sebagai `LTP`. Spasi di awal/akhir dibuang. Sebaiknya input kode langsung diubah ke huruf besar saat diketik.
- `item_code` unik di **semua** master, termasuk yang sudah dinonaktifkan. Kode master yang dihapus tidak bisa dipakai lagi.
- Tampilkan contoh hasil kode produk di bawah input, misalnya "Kode produk: `LTP-00001`, `LTP-00002`, ...".

Response sukses (`201`):

```json
{
  "success": true,
  "code": 201,
  "message": "Master item created",
  "data": {
    "id": 1,
    "item_code": "LTP",
    "item_name": "Laptop",
    "is_active": true,
    "createdAt": "2026-11-23T03:00:00.000Z",
    "updatedAt": "2026-11-23T03:00:00.000Z"
  },
  "timestamp": "2026-11-23T03:00:00.000Z"
}
```

## 2. List dan detail

`GET /api/master-items?search=lap&page=1&limit=10`

```json
{
  "success": true,
  "code": 200,
  "message": "Success",
  "pagination": {
    "total_data": 1,
    "total_page": 1,
    "current_page": 1,
    "per_page": 10
  },
  "data": [
    { "id": 1, "item_code": "LTP", "item_name": "Laptop", "is_active": true, "createdAt": "...", "updatedAt": "..." }
  ]
}
```

- Urut berdasarkan `item_code` (A-Z).
- `search` mencari di `item_code` dan `item_name`, sebagian kata juga cocok (`lap` menemukan `Laptop`, `lt` menemukan `LTP`).
- Tanpa `page` dan `limit`, `data` berisi semua master aktif tanpa `pagination`.
- `GET /api/master-items/:id` mengembalikan satu objek yang sama. Master yang nonaktif atau tidak ada menghasilkan `404`.

## 3. Edit

`PUT /api/master-items/:id`

Kirim **hanya field yang diubah**.

```json
{ "item_name": "Laptop Kantor" }
```

- `item_name` selalu bisa diubah. Nama baru dipakai untuk PR dan inventory request **berikutnya**. Data yang sudah ada tetap menyimpan nama saat data itu dibuat. Stok inventory tetap tergabung karena dicocokkan dengan `id_master_item`, bukan nama.
- `item_code` **tidak bisa diubah** setelah master dipakai minimal satu item Purchase Request (409). Mengirim kode yang sama (huruf besar/kecil apa pun) tetap boleh.
- Di form edit, kunci input `item_code` jika master sudah dipakai. Karena tidak ada flag "sudah dipakai" di response, cara paling sederhana adalah tetap menampilkan input dan menampilkan pesan error 409 dari backend.

## 4. Hapus (nonaktifkan)

`DELETE /api/master-items/:id`

Tanpa body. Response:

```json
{ "success": true, "code": 200, "message": "Master item deleted", "data": null }
```

Tampilkan konfirmasi sebelum menghapus, misalnya: "Master barang ini tidak bisa dipilih lagi untuk Purchase Request dan inventory request baru. Kodenya juga tidak bisa dipakai lagi."

Data yang sudah memakai master ini (PR, GA PO, inventory, inventory request) tidak berubah dan tetap menampilkan `master_item`-nya.

## 5. Memakai master barang di form lain

### Pilihan barang (dropdown)

Pakai `GET /api/master-items?search=<ketikan user>&page=1&limit=20` sebagai sumber dropdown dengan pencarian. Tampilkan `item_code` dan `item_name`, misalnya `LTP - Laptop`. Simpan `id`-nya sebagai `id_master_item`.

### Purchase Request

Per item, kirim `id_master_item` (wajib) dan `model_number` (opsional). ~~`item_name`~~ dan ~~`serial_number`~~ tidak dikirim lagi.

```json
{
  "id_master_item": 1,
  "brand": "Dell",
  "model_number": "Latitude 5440",
  "quantity_unit": "unit",
  "quantity": 2,
  "procurement_type": "Pengadaan Baru",
  "item_category": "item"
}
```

Semua item wajib memilih master, termasuk item `services` (buat master seperti `SRV` - Jasa Servis). Detail body PR ada di [procurement.md](procurement.md).

### Inventory request

Kirim `id_master_item` (wajib) dan `model_number` (opsional). Detail ada di [inventory-request-frontend.md](inventory-request-frontend.md).

### Menampilkan master di data lain

Response item PR, item GA PO, inventory request, dan inventory berisi:

```json
"master_item": { "id": 1, "item_code": "LTP", "item_name": "Laptop" }
```

Data lama yang dibuat sebelum master barang ada berisi `id_master_item: null` dan `master_item: null`. Untuk data seperti ini, tampilkan `item_name` saja.

Inventory bisa difilter per master: `GET /api/inventories?id_master_item=1`.

## 6. Pesan error yang perlu ditangani

| HTTP | Pesan                                                                             | Kapan                                                        |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 400  | `item_code is required`, `item_name is required`                                  | Field kosong                                                 |
| 400  | `item_code must be 2-10 uppercase letters or digits`                              | Kode terlalu pendek/panjang atau berisi spasi/tanda baca     |
| 409  | `item_code ... already exists`                                                    | Kode sudah dipakai master lain, termasuk yang nonaktif       |
| 409  | `item_code cannot be changed once the master item is used by a purchase request` | Ubah kode master yang sudah dipakai item PR                  |
| 404  | `Master item not found`                                                           | Detail/edit/hapus master yang tidak ada atau sudah nonaktif  |
| 404  | `Master item ... not found`                                                       | Simpan PR / inventory request dengan master tidak ada/nonaktif |

Pesan error ada di field `message` pada response.
