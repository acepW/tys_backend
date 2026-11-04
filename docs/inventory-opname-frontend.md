# Panduan Frontend: Inventory Opname

Semua endpoint berawalan `/api/inventory-opnames` dan butuh login.

## Konsep singkat

1. User membuat opname untuk satu **company** dan satu **lokasi**. Semua item inventory company dan lokasi tersebut otomatis masuk list beserta **qty sistem** saat itu (`quantity_system`). Inventory company/lokasi lain tidak ikut.
2. User mengisi `quantity_actual`, `input_status`, dan `note` per item. Bisa disimpan banyak item sekaligus.
3. Setelah semua item tersimpan, user klik **Request**.
4. Approver meng-approve atau me-reject setiap item (bisa banyak sekaligus). Item yang di-reject diperbaiki user lalu disimpan lagi, dan langsung bisa di-review ulang tanpa request ulang.
5. Setelah semua item di-approve, approver meng-approve tiket. Qty inventory **ditambah selisih** (`quantity_actual - quantity_system`), dan setiap item yang qty-nya berubah dicatat di history inventory.

Karena qty inventory diubah lewat selisih, barang yang masuk selama opname (misalnya dari GA PO) tidak hilang. Contoh: qty sistem 10, aktual 7 (selisih -3); selama opname masuk 2 unit sehingga stok jadi 12; setelah approve stok menjadi 12 - 3 = 9.

Hanya boleh ada **satu opname terbuka** (`pending` / `request`) per company dan lokasi dalam satu waktu; company/lokasi lain tetap bisa di-opname bersamaan. Opname `pending` yang salah dibuat bisa dibatalkan oleh pembuatnya.

## Status

**Tiket** (`status`):

| Status     | Arti                                                          |
| ---------- | ------------------------------------------------------------- |
| `pending`  | User sedang menghitung dan menyimpan item                      |
| `request`  | Menunggu approver me-review item lalu meng-approve tiket       |
| `approved` | Selesai, qty inventory sudah disesuaikan. Status akhir         |

**Item** (`items[].status`):

| Status    | Arti                                                    |
| --------- | ------------------------------------------------------- |
| `pending` | Belum dihitung                                          |
| `save`    | Sudah dihitung, menunggu review (saat tiket `request`)  |
| `approve` | Disetujui approver                                      |
| `reject`  | Ditolak approver (`review_note` berisi alasannya), perlu diperbaiki user |

Selain itu setiap item punya `input_status`: teks bebas yang diisi user, misalnya "2 unit rusak".

## Endpoint

| Aksi               | Method & endpoint                    | Siapa      | Status tiket |
| ------------------ | ------------------------------------ | ---------- | ------------ |
| List               | `GET /`                              | Semua      |              |
| Detail             | `GET /:id`                           | Semua      |              |
| List item          | `GET /:id/items`                     | Semua      |              |
| Buat opname        | `POST /`                             | User       |              |
| Simpan hitungan    | `PUT /:id/items`                     | Pembuat    | `pending`, `request` (hanya item `reject`) |
| Request            | `PATCH /request/:id`                 | Pembuat    | `pending`    |
| Review item        | `PATCH /review/:id/items`            | Approver   | `request`    |
| Approve tiket      | `PATCH /approve/:id`                 | Approver   | `request`    |
| Batalkan           | `DELETE /:id`                        | Pembuat    | `pending`    |

## 1. Buat opname

`POST /api/inventory-opnames`

```json
{
  "id_company": 2,
  "id_inventory_location": 4,
  "opname_date": "2026-10-20",
  "note": "Opname akhir bulan (opsional)"
}
```

| Field                   | Wajib | Isi                                                                                       |
| ----------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `id_company`            | Ya    | Company yang di-opname (`GET /api/companies`)                                              |
| `id_inventory_location` | Tidak | Lokasi yang di-opname (`GET /api/inventory-locations`). Jika kosong, lokasi default company |
| `opname_date`           | Tidak | Default hari ini                                                                           |
| `note`                  | Tidak | Catatan                                                                                    |

`opname_no` dibuat otomatis dengan format `SO-<initial_company>-MM-YYYY-0001`, misalnya `SO-TYS-11-2026-0001`. Bulan dan tahun diambil dari tanggal tiket dibuat. Nomor urut dihitung per inisial company (semua lokasi company itu memakai urutan yang sama) dan di-reset setiap tahun. Company wajib punya `initial_company`. Opname lama tetap memakai nomor `OPN-...`. `id_user_opname` adalah user yang login. Response (`201`) berisi detail opname seperti di bagian 2.

## 2. List dan detail

- `GET /api/inventory-opnames?search=SO-TYS&status=pending&id_company=2&id_inventory_location=4&page=1&limit=10`: `search` mencari `opname_no`; `id_company` dan `id_inventory_location` opsional. Response tidak berisi item.
- List dan detail berisi `id_company`, `id_inventory_location`, `company: { id, company_name, initial_company }`, dan `inventory_location: { id, location_code, location_name }`.
- `GET /api/inventory-opnames/:id`: detail beserta `user_opname`, semua `items` (urut nama barang), dan `verification_progress`.
- `GET /api/inventory-opnames/:id/items?search=kursi&status=reject&page=1&limit=50`: item saja dengan pagination, untuk opname yang itemnya banyak. `search` mencari nama barang. Bisa juga difilter dengan `purchase_request_category`.

List dan detail berisi `is_can_approve_reject` (user boleh review item/approve tiket) dan `action_label`.

Field item: `id`, `id_inventory`, `item_name`, `brand`, `serial_number`, `size`, `material`, `other`, `purchase_request_category` (disalin dari inventory saat opname dibuat), `quantity_unit`, `quantity_system`, `quantity_actual`, `quantity_difference`, `input_status`, `note`, `status`, `review_note`, dan `details` (rincian status, lihat bagian 3).

## 3. Simpan hitungan (banyak sekaligus)

`PUT /api/inventory-opnames/:id/items`

```json
{
  "items": [
    {
      "id": 101,
      "quantity_actual": 8,
      "input_status": "2 unit patah",
      "note": "Gudang A",
      "details": [
        { "quantity": 6, "input_status": "Baik", "note": "Rak 1" },
        { "quantity": 2, "input_status": "Patah" }
      ]
    },
    { "id": 102, "quantity_actual": 4 }
  ]
}
```

- `id` adalah `items[].id` (bukan `id_inventory`). `quantity_actual` wajib (angka ≥ 0); `input_status` dan `note` opsional.
- `details` **opsional**: rincian status item. Setiap baris berisi `quantity` (wajib, angka ≥ 0), `input_status` (wajib), dan `note` (opsional). Jika `details` dikirim, isinya menggantikan rincian lama (`[]` menghapus semua rincian). Jika tidak dikirim, rincian lama tetap. Jumlah `quantity` di `details` tidak harus sama dengan `quantity_actual`.
- Item menjadi `save` dan `quantity_difference` dihitung otomatis.
- Saat tiket `pending`: item `pending` dan `save` bisa disimpan (dan disimpan ulang).
- Saat tiket `request`: hanya item `reject` yang bisa disimpan; setelah disimpan statusnya kembali `save` dan approver bisa langsung me-review lagi.
- Kalau salah satu item tidak valid, tidak ada yang tersimpan.

## 4. Request

`PATCH /api/inventory-opnames/request/:id` dengan body `{ "note": "opsional" }`. Ditolak (`409`) kalau masih ada item yang belum `save`.

## 5. Review item (banyak sekaligus)

`PATCH /api/inventory-opnames/review/:id/items`

```json
{
  "items": [
    { "id": 101, "decision": "reject", "note": "Hitung ulang, rak belakang belum" },
    { "id": 102, "decision": "approve" }
  ]
}
```

`decision`: `approve` atau `reject`. `note` wajib untuk reject. Hanya item berstatus `save` yang bisa di-review.

## 6. Approve tiket

`PATCH /api/inventory-opnames/approve/:id` dengan body `{ "note": "opsional" }`. Hanya bisa kalau **semua** item `approve`. Untuk setiap item dengan selisih ≠ 0:

- qty inventory = qty inventory sekarang + `quantity_difference`;
- dicatat di `histories` inventory (`GET /api/inventories/:id`) dengan `quantity` = selisih (bisa minus), `inventory_opname.opname_no`, dan note `Stock opname OPN-...`.

Kalau hasilnya membuat stok minus, approve ditolak (`409`) dan tidak ada yang berubah.

## 7. Batalkan

`DELETE /api/inventory-opnames/:id`: hanya pembuat, hanya saat `pending`. Opname tidak muncul lagi di list.

## Tombol dan aturan tampilan

- Form hitungan dan tombol **Simpan**: pembuat, tiket `pending` (semua item yang belum di-review) atau tiket `request` (hanya item `reject`, tampilkan `review_note`).
- Tombol **Request**: pembuat, tiket `pending`, semua item `save`.
- Checkbox **Approve / Reject item**: `is_can_approve_reject` = `true`, tiket `request`, item `save`.
- Tombol **Approve tiket**: `is_can_approve_reject` = `true`, tiket `request`, semua item `approve`.
- Tombol **Batalkan**: pembuat, tiket `pending`.

## Verification progress

Progress dicatat per aksi tiket, **bukan per item**, karena satu opname berisi semua item inventory. Alasan reject per item ada di `items[].review_note`.

| `status`       | Dari aksi                                          | `note`                                             |
| -------------- | -------------------------------------------------- | -------------------------------------------------- |
| `pending`      | Opname dibuat                                      | `Inventory opname created with N items`            |
| `save items`   | Simpan hitungan (satu baris per simpan)            | `N items saved`, ditambah `(M rejected items corrected)` jika ada item reject yang diperbaiki |
| `request`      | Request                                            | Note dari user                                     |
| `review items` | Approver me-review item (satu baris per review)    | `A items approved, R items rejected`               |
| `approved`     | Tiket di-approve, stok disesuaikan                 | Note dari approver                                 |
| `cancelled`    | Opname dibatalkan                                  |                                                    |

## Pesan error yang perlu ditangani

| HTTP | Pesan                                                                                     | Kapan                                          |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 400  | `items must be a non-empty array`, `items[i]: ...`                                        | Validasi simpan/review                          |
| 403  | `Only the creator can ...`                                                                | Simpan/request/batal oleh selain pembuat        |
| 404  | `Inventory opname not found`, `Inventory opname items not found: ...`                     | ID salah                                        |
| 400  | `id_company is required`                                                                  | Buat opname tanpa company                       |
| 400  | `id_inventory_location is required: the company has no default inventory location`       | Lokasi kosong dan company belum punya default   |
| 404  | `Company not found`, `Inventory location not found`                                       | Company/lokasi tidak ada atau tidak aktif       |
| 409  | `Company ... has no initial_company`                                                      | Inisial company kosong (untuk nomor opname)     |
| 409  | `Inventory opname SO-... is still pending; finish it before creating a new one`          | Masih ada opname terbuka di company & lokasi ini |
| 409  | `There is no inventory to count in this company and location`                             | Inventory company & lokasi ini kosong           |
| 409  | `Item ... cannot be edited while it is ...` / `... cannot be reviewed while it is ...`    | Status item tidak sesuai                        |
| 409  | `N items have not been saved yet` / `N items have not been approved yet`                  | Request / approve tiket terlalu cepat           |
| 409  | `Stock of ... would become negative (...)`                                                | Approve membuat stok minus                      |

## Setup

- Kolom `id_company` dan `id_inventory_location` di `inventory_opnames` dibuat dengan `npm run db:sync-inventory-location`.
- Migrasi database (sekali per environment): `npm run db:sync-inventory-opname`. Jalankan lagi untuk membuat tabel rincian status item `inventory_opname_item_details` dan kolom `purchase_request_category` di item opname (item opname lama diisi dari inventory-nya).
- Approver diatur lewat approval flow dengan `approval_for` = `inventory opname` dan status `request`. `npm run db:setup-approval-flows [nama_posisi]` membuat flow default jika belum ada. Selama `APPROVAL_ENFORCE` belum `true`, review dan approve oleh siapa pun tetap berhasil.
