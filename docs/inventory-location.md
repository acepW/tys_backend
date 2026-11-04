# Inventory Location (Master Lokasi)

Inventory sekarang dicatat per **company** dan per **lokasi**. Semua endpoint berawalan `/api` dan butuh login.

## Ringkasan perubahan

| Bagian                     | Perubahan                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Master lokasi (baru)       | Tabel `inventory_locations`: `location_code` (unik), `location_name`, `is_active`                                                  |
| Master company             | Kolom baru `id_inventory_location` = lokasi default company                                                                        |
| Inventory                  | Kolom baru `id_company` dan `id_inventory_location`                                                                                |
| Inventory request          | Kolom baru `id_company` (wajib) dan `id_inventory_location` (default: lokasi default company)                                      |
| Pencocokan stok            | `item_name`, `brand`, `serial_number`, `size`, `material`, `other` **+ `id_company` + `id_inventory_location`** harus sama persis  |
| GA PO (Accepted/Returned)  | `id_company` dari GA PO, `id_inventory_location` dari lokasi default company GA PO                                                 |
| Stock opname               | Kolom baru `id_company` (wajib) dan `id_inventory_location` (default: lokasi default company); hanya inventory company & lokasi itu yang di-opname. Nomor `SO-<initial_company>-MM-YYYY-0001`, lihat [inventory-opname-frontend.md](inventory-opname-frontend.md) |

## Endpoint master lokasi

| Aksi   | Method & endpoint                       | Keterangan                                                              |
| ------ | --------------------------------------- | ----------------------------------------------------------------------- |
| List   | `GET /api/inventory-locations`          | Filter `search` (kode atau nama), `page`, `limit`. Hanya yang aktif     |
| Detail | `GET /api/inventory-locations/:id`      |                                                                         |
| Buat   | `POST /api/inventory-locations`         | `location_code` dan `location_name` wajib                               |
| Edit   | `PUT /api/inventory-locations/:id`      | Kirim field yang diubah saja                                            |
| Hapus  | `DELETE /api/inventory-locations/:id`   | Nonaktifkan. Ditolak jika masih jadi lokasi default company yang aktif  |

```json
{ "location_code": "GDG-01", "location_name": "Gudang Utama" }
```

## Master company

`POST /api/companies` dan `PUT /api/companies/:id` menerima `id_inventory_location` (boleh `null`). List dan detail company mengembalikan `inventory_location: { id, location_code, location_name }`.

Lokasi default dipakai untuk:

- **GA PO**: stok dari Accepted/Returned masuk ke lokasi ini. Jika kosong, Accepted/Returned item `item_category` = `item` ditolak (409).
- **Inventory request**: jika `id_inventory_location` tidak dikirim, diisi lokasi ini. Saat edit, mengirim `id_company` saja akan memindah request ke lokasi default company baru.

## Inventory

- `GET /api/inventories` menerima filter `id_company`, `id_inventory_location`, dan `movement_status` (lihat [inventory-movement-frontend.md](inventory-movement-frontend.md)), dan mengembalikan `company: { id, company_name }` serta `inventory_location`.
- `GET /api/inventories/check-stock` sekarang **wajib** `id_company` dan `id_inventory_location`.

## Pesan error

| HTTP | Pesan                                                                                          | Kapan                                                   |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 400  | `location_code is required`, `location_name is required`                                       | Validasi form lokasi                                    |
| 409  | `location_code ... already exists`                                                             | Kode sudah dipakai (termasuk lokasi yang dinonaktifkan) |
| 409  | `Inventory location is the default location of N company(ies)`                                | Hapus lokasi yang masih default company                 |
| 400  | `Inventory location not found`                                                                 | Simpan company dengan lokasi yang tidak ada/aktif       |
| 409  | `Company ... has no default inventory location; set it in master company first`                | Accepted/Returned GA PO, company belum punya lokasi     |

## Setup dan data lama

Jalankan sekali setelah deploy: `npm run db:sync-inventory-location` (aman dijalankan ulang). Script membuat tabel `inventory_locations` dan menambah kolom di `companies`, `inventories`, `inventory_requests`, dan `inventory_opnames` pada kedua database.

Data lama berisi `null` untuk kolom baru, sehingga:

- Stok baru **tidak** akan tergabung ke inventory lama (company/lokasi `null`); akan dibuat baris inventory baru. Isi `id_company` dan `id_inventory_location` inventory lama lewat SQL jika ingin tetap tergabung.
- Inventory request `pending` lama harus diedit (isi `id_company`) sebelum bisa di-approve.
- Isi lokasi default setiap company sebelum GA Staff melakukan Accepted/Returned.
