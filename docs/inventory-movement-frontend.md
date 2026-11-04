# Panduan Frontend: Inventory Movement

Inventory movement memindahkan stok satu baris inventory ke **lokasi lain dalam company yang sama**. Semua endpoint berawalan `/api/inventory-movements` dan butuh login.

## Konsep singkat

- Ada dua jenis (`movement_type`), dengan cara pindah stok yang **sama**. Jenis hanya mencatat alasan pemindahan:
  - `stock transfer` — pemindahan antar-lokasi.
  - `stock allocation` — penempatan stok baru, misalnya stok hasil GA PO yang masuk ke lokasi default company lalu ditempatkan ke lokasi penyimpanan.
- Sumber stok adalah **satu baris inventory** (`id_inventory_source`). Baris ini sudah punya company dan lokasi, jadi lokasi asal = lokasi baris tersebut.
- Approval dua tahap: **SPV GA**, lalu **Manager GA**. Stok baru pindah saat Manager GA approve.
- Saat pindah, qty sumber dikurangi. Qty tujuan ditambahkan ke inventory dengan barang, company, dan lokasi tujuan yang sama persis. Kalau belum ada, dibuat baris inventory baru.
- Setelah stok pindah, `movement_status` di baris inventory sumber **dan** tujuan diisi jenis movement tersebut (`stock transfer` / `stock allocation`). Nilainya selalu jenis movement terakhir yang di-approve untuk baris itu, dan `null` kalau baris belum pernah dipindah. Di `GET /api/inventories` bisa difilter dengan `movement_status=stock transfer`, `movement_status=stock allocation`, atau `movement_status=none` (belum pernah dipindah).
- `movement_no` dibuat otomatis: `IM-<initial_company>-MM-YYYY-0001`. Nomor urut per inisial company dan di-reset setiap tahun.

## Status

| Status               | Arti                                  | Aksi                               |
| -------------------- | ------------------------------------- | ---------------------------------- |
| `request spv ga`     | Menunggu SPV GA                       | Approve / Reject (SPV GA)          |
| `request manager ga` | Disetujui SPV GA, menunggu Manager GA | Approve / Reject (Manager GA)      |
| `approved`           | Disetujui Manager GA, stok sudah pindah | —                                |
| `rejected`           | Ditolak SPV GA atau Manager GA        | —                                  |

Siapa yang boleh approve diatur di approval flow dengan `approval_for` = `inventory movement` dan status `request spv ga` / `request manager ga`. Movement yang menunggu juga muncul di **My Task** (`GET /api/my-tasks?approval_for=inventory movement`).

## Endpoint

| Aksi    | Method & endpoint                  | Keterangan                                                                                     |
| ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| List    | `GET /`                            | Filter: `search` (nomor atau nama barang), `status`, `movement_type`, `id_company`, `id_inventory_source`, `page`, `limit` |
| Detail  | `GET /:id`                         |                                                                                                |
| Buat    | `POST /`                           |                                                                                                |
| Approve | `PATCH /approve/:id`               | `note` opsional. SPV GA → `request manager ga`; Manager GA → `approved` + stok pindah          |
| Reject  | `PATCH /reject/:id`                | `note` wajib                                                                                   |

## 1. Form "New Inventory Movement"

`POST /api/inventory-movements`

```json
{
  "movement_type": "stock transfer",
  "id_inventory_source": 12,
  "id_inventory_location_destination": 1,
  "quantity": 10,
  "reason": "Replenishment",
  "note": "Tuliskan alasan dan referensi transaksi"
}
```

| Field                               | Wajib | Isi                                                                     |
| ----------------------------------- | ----- | ----------------------------------------------------------------------- |
| `movement_type`                     | Ya    | `stock transfer` atau `stock allocation`                                |
| `id_inventory_source`               | Ya    | `id` baris inventory sumber                                             |
| `id_inventory_location_destination` | Ya    | Lokasi tujuan (`GET /api/inventory-locations`); harus beda dari lokasi sumber |
| `quantity`                          | Ya    | Lebih dari 0 dan tidak melebihi stok sumber                             |
| `reason`                            | Tidak | Teks bebas, misalnya `Replenishment` (daftar pilihan ditentukan frontend) |
| `note`                              | Tidak | Remarks / justification                                                 |

Cara mengisi `id_inventory_source` dari form:

- **Stock Allocation**: pilih baris inventory (`GET /api/inventories`, misalnya difilter lokasi default company). `id` baris itu adalah `id_inventory_source`.
- **Stock Transfer**: setelah barang dan **Source Location** dipilih, cari barisnya dengan `GET /api/inventories/check-stock?item_name=...&brand=...&serial_number=...&size=...&material=...&other=...&id_company=...&id_inventory_location=<lokasi sumber>`. `id_inventory` dari hasilnya adalah `id_inventory_source`. Kalau `id_inventory` `null`, stok sumber 0.

### Stock Movement Preview

- **Source Stock**: `quantity` baris sumber. After = source − qty.
- **Destination Stock**: `check-stock` dengan field barang yang sama, `id_company` sumber, dan `id_inventory_location` = lokasi tujuan. After = destination + qty.
- Nonaktifkan Submit jika qty > source stock. API juga menolak dengan `Insufficient stock: source only has N <satuan>`.

Stok dicek saat dibuat dan **dicek lagi** saat Manager GA approve, karena stok sumber bisa berubah selama menunggu approval.

## 2. List dan detail

Setiap movement berisi field di atas, `movement_no`, `id_company`, `id_inventory_location_source`, `id_inventory_destination` (terisi setelah `approved`), `item_name`, `quantity_unit`, `status`, dan relasi berikut:

- `company`: `{ id, company_name }`
- `inventory_source`, `inventory_destination`: `{ id, item_name, brand, serial_number, size, material, other, quantity, quantity_unit }`. `quantity` di sini adalah **stok saat ini**.
- `inventory_location_source`, `inventory_location_destination`: `{ id, location_code, location_name }`
- `user_request`, `verification_progress` (`request spv ga`, `approved spv ga`, `approved manager ga`, `rejected spv ga`, `rejected manager ga`)
- `is_can_approve_reject`, `action_label`

`quantity` dikirim sebagai string desimal (`"10.00"`).

Riwayat stok di detail inventory (`GET /api/inventories/:id`, `histories[]`) mencatat setiap movement: qty negatif di baris sumber dan qty positif di baris tujuan, dengan `inventory_movement: { id, movement_no, movement_type }`.

## 3. Pesan error yang perlu ditangani

| HTTP | Pesan                                                                    | Kapan                                         |
| ---- | ------------------------------------------------------------------------ | --------------------------------------------- |
| 400  | `movement_type must be one of: ...`, `... is required`, `quantity must be a positive number` | Validasi form                 |
| 400  | `Destination location must differ from the source location`              | Lokasi tujuan sama dengan lokasi sumber       |
| 404  | `Source inventory not found`, `Destination location not found`           | ID salah atau lokasi tidak aktif              |
| 409  | `Insufficient stock: source only has N ...`                              | Qty melebihi stok sumber (saat buat atau approve akhir) |
| 409  | `Source inventory has no company or location yet`                       | Baris inventory lama tanpa company/lokasi     |
| 409  | `Company ... has no initial_company`                                     | Inisial company kosong (untuk nomor movement) |
| 400  | `note is required for rejection`                                         | Reject tanpa note                             |
| 409  | `Inventory movement is already approved` / `... already rejected`        | Approve/reject movement yang sudah selesai    |
| 403/409 | `You are not allowed to act on Inventory Movement ...` / `Action is not allowed from status ...` | Bukan approver status ini |

## Setup

1. `npm run db:sync-inventory-location` (jika belum), lalu `npm run db:sync-inventory-movement`. Keduanya aman dijalankan ulang. Script kedua membuat tabel `inventory_movements` dan `inventory_movement_verification_progress`, serta menambah `inventory_histories.id_inventory_movement` dan `inventories.movement_status`.
2. Atur approver di approval flow: `inventory movement` / `request spv ga` → posisi SPV GA, `inventory movement` / `request manager ga` → posisi Manager GA. `npm run db:setup-approval-flows [nama_posisi]` membuat flow default jika belum ada.
