# Panduan Frontend: Inventory Request

Inventory request dipakai untuk **menambah stok inventory secara manual**. Stok tidak langsung bertambah: request harus di-approve dulu oleh approver yang diatur di approval flow. Semua endpoint berawalan `/api` dan memakai cookie login yang sama seperti endpoint lain.

> `POST /api/inventories` sudah **dihapus**. Form tambah stok manual sekarang memakai `POST /api/inventory-requests`.

## Konsep singkat

- Satu request = **satu barang**.
- Status request:

| Status    | Arti                                           | Bisa diedit?      | Tombol Approve/Reject                     |
| --------- | ---------------------------------------------- | ----------------- | ----------------------------------------- |
| `pending` | Menunggu approval                              | Ya, hanya pembuat | Tampil jika `is_can_approve_reject: true` |
| `approve` | Disetujui. Stok sudah ditambahkan ke inventory | Tidak             | Tidak                                     |
| `reject`  | Ditolak. Stok tidak berubah                    | Tidak             | Tidak                                     |

- Approval hanya **satu tahap**. Siapa yang boleh approve diatur di halaman setting approval flow dengan `approval_for` = `inventory request` dan status `pending`.
- Request yang menunggu approval juga muncul di **My Task** (`GET /api/my-tasks?approval_for=inventory request`). Karena request tidak punya nomor dokumen, `document_no` di My Task berisi `item_name`.

## Endpoint

| Aksi         | Method & endpoint                           | Keterangan                                                |
| ------------ | ------------------------------------------- | --------------------------------------------------------- |
| List         | `GET /api/inventory-requests`               | Filter: `search` (nama barang), `status`, `page`, `limit` |
| Detail       | `GET /api/inventory-requests/:id`           |                                                           |
| Buat request | `POST /api/inventory-requests`              |                                                           |
| Buat banyak  | `POST /api/inventory-requests/bulk`         | Banyak request sekaligus (maks. 100), lihat bagian 1b     |
| Edit request | `PUT /api/inventory-requests/:id`           | Hanya pembuat, hanya saat `pending`                       |
| Approve      | `PATCH /api/inventory-requests/approve/:id` | `note` opsional                                           |
| Reject       | `PATCH /api/inventory-requests/reject/:id`  | `note` wajib                                              |

## 1. Form buat request

`POST /api/inventory-requests`

```json
{
  "item_name": "Printer",
  "brand": "HP",
  "serial_number": "M404dn",
  "size": "A4",
  "material": "Plastic",
  "other": "Laser, duplex",
  "purchase_request_category": "Office Equipment",
  "asset_category": "asset",
  "quantity_unit": "unit",
  "quantity": 2,
  "received_date": "2026-10-20",
  "note": "Stok awal gudang",
  "files_product": [
    {
      "original_name": "printer.png",
      "indonesian_name": "printer",
      "mandarin_name": "布迪桑托索照片",
      "stored_name": "1760000000000-printer.png",
      "url": "/uploads/...",
      "mime_type": "image/png",
      "size": 102400
    }
  ]
}
```

| Field                                                 | Wajib | Isi                                                                                                        |
| ----------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| `item_name`                                           | Ya    | Nama barang                                                                                                |
| `quantity_unit`                                       | Ya    | Satuan, misalnya `unit`, `pcs`, `box`                                                                      |
| `quantity`                                            | Ya    | Angka lebih dari 0                                                                                         |
| `received_date`                                       | Ya    | Tanggal penerimaan barang, format `YYYY-MM-DD`                                                             |
| `brand`, `serial_number`, `size`, `material`, `other` | Tidak | Spesifikasi barang. Dipakai untuk mencocokkan stok (lihat bagian 4)                                        |
| `purchase_request_category`                           | Tidak | Kategori barang                                                                                            |
| `asset_category`                                      | Tidak | `asset` atau `non asset`                                                                                   |
| `note`                                                | Tidak | Catatan pembuat                                                                                            |
| `files_product`                                       | Tidak | Foto/file produk. Upload dulu lewat endpoint upload (`/api/uploads/...`), lalu kirim hasilnya di array ini |

Tips: sebelum submit, frontend bisa menampilkan stok saat ini dengan `GET /api/inventories/check-stock?item_name=...&brand=...&serial_number=...&size=...&material=...&other=...`. Jika barang belum ada, hasilnya `quantity: 0`.

Response sukses (`201`) berisi detail request seperti di bagian 2.

## 1b. Buat banyak request sekaligus

`POST /api/inventory-requests/bulk`

Isi `items` dengan array berisi body yang sama seperti bagian 1 (maksimal 100 item). Setiap item menjadi **satu inventory request terpisah** berstatus `pending`. Setelah dibuat, edit, approve, dan reject tetap dilakukan satu per satu per request seperti biasa.

```json
{
  "items": [
    { "item_name": "Kursi", "quantity_unit": "unit", "quantity": 10, "received_date": "2026-10-20", "files_product": [] },
    { "item_name": "Meja", "brand": "Olympic", "quantity_unit": "unit", "quantity": 5, "received_date": "2026-10-21", "note": "Stok awal" }
  ]
}
```

- Semua item disimpan dalam satu transaksi: kalau satu item gagal, **tidak ada** yang tersimpan.
- Pesan error validasi menyebut posisi item, mis. `items[1]: quantity must be a positive number` (index mulai dari 0).
- Response sukses (`201`) berisi array detail request yang dibuat, urut sesuai `items`, masing-masing dengan `is_can_approve_reject` dan `action_label`.

## 2. List dan detail

`GET /api/inventory-requests?status=pending&page=1&limit=10`

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
    {
      "id": 3,
      "item_name": "Printer",
      "brand": "HP",
      "serial_number": "M404dn",
      "size": "A4",
      "material": "Plastic",
      "other": "Laser, duplex",
      "purchase_request_category": "Office Equipment",
      "asset_category": "asset",
      "quantity_unit": "unit",
      "quantity": "2.00",
      "note": "Stok awal gudang",
      "status": "pending",
      "id_user_request": 5,
      "id_inventory": null,
      "user_request": { "id": 5, "name": "Budi", "email": "budi@example.com" },
      "inventory": null,
      "files_product": [],
      "verification_progress": [
        {
          "status": "pending",
          "note": "Inventory request created",
          "createdAt": "2026-10-13T03:00:00.000Z",
          "user": { "id": 5, "name": "Budi" }
        }
      ],
      "is_can_approve_reject": true,
      "action_label": "Approve / Reject Inventory Request"
    }
  ]
}
```

Tanpa `page` dan `limit`, `data` berisi semua request tanpa `pagination`.

Catatan field:

- `quantity` dikirim sebagai string desimal (`"2.00"`). Ubah ke angka sebelum ditampilkan atau dihitung.
- `inventory` terisi setelah request di-approve: `{ id, item_name, quantity, quantity_unit }`. `quantity` di sini adalah **total stok inventory saat ini**, bukan jumlah dari request ini. Bisa dipakai untuk link ke halaman detail inventory (`/inventories/:id`).
- `verification_progress` adalah riwayat (dibuat, diedit, approve, reject) dan bisa ditampilkan sebagai timeline.

## 3. Tombol dan aturan tampilan

| Kondisi                                                                  | Tampilkan                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `status === "pending"` dan user login adalah pembuat (`id_user_request`) | Tombol **Edit**                                                |
| `is_can_approve_reject === true`                                         | Tombol **Approve** dan **Reject**                              |
| `is_can_approve_reject === false` dan `action_label` ada                 | Badge, misalnya "Menunggu: Approve / Reject Inventory Request" |
| `status` `approve` / `reject`                                            | Tanpa tombol                                                   |

Jangan menentukan tombol Approve/Reject dari posisi user sendiri. Cukup pakai `is_can_approve_reject` dari backend.

## 4. Edit request

`PUT /api/inventory-requests/:id`

Kirim **hanya field yang diubah**. Field yang tidak dikirim tetap seperti semula.

```json
{ "quantity": 3, "note": "Revisi jumlah" }
```

Untuk `files_product`: kalau array dikirim, isinya menggantikan daftar file lama. Sertakan `id` file lama yang ingin dipertahankan. File yang tidak ada di array akan dihapus. Kalau `files_product` tidak dikirim, file tidak berubah.

```json
{
  "files_product": [
    { "id": 41 },
    {
      "original_name": "baru.png",
      "stored_name": "...",
      "url": "...",
      "mime_type": "image/png",
      "size": 2048
    }
  ]
}
```

## 5. Approve dan reject

Approve (note opsional):

```http
PATCH /api/inventory-requests/approve/3
```

```json
{ "note": "Sudah dicek fisik" }
```

Reject (note **wajib**, tampilkan modal input alasan):

```http
PATCH /api/inventory-requests/reject/3
```

```json
{ "note": "Barang tidak ditemukan di gudang" }
```

Keduanya mengembalikan detail request terbaru.

Yang terjadi saat approve:

- Jika sudah ada inventory dengan `item_name`, `brand`, `serial_number`, `size`, `material`, dan `other` yang **sama persis** (kosong dianggap sama), `quantity` request ditambahkan ke inventory tersebut.
- Jika tidak ada yang sama, dibuat data inventory baru dengan `received_date` dari request.
- `files_product` request disalin ke inventory, dan penambahan stok tercatat di `histories` inventory beserta `received_date` request.

## 6. Pesan error yang perlu ditangani

| HTTP | Pesan                                                                                      | Kapan                                           |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 400  | `item_name is required`, `quantity_unit is required`, `quantity must be a positive number` | Validasi form                                   |
| 400  | `received_date must be a valid date`                                                       | `received_date` kosong atau bukan tanggal       |
| 400  | `asset_category must be asset or non asset`                                                | Nilai `asset_category` tidak valid              |
| 400  | `files_product must be an array`                                                           | `files_product` bukan array                     |
| 400  | `items must be a non-empty array`, `items can contain at most 100 entries`, `items[i]: ...` | Validasi bulk create                            |
| 400  | `note is required for rejection`                                                           | Reject tanpa note                               |
| 403  | `Only the creator can edit this inventory request`                                         | Edit oleh user selain pembuat                   |
| 403  | `You are not allowed to act on Inventory Request ...`                                      | Approve/reject oleh user yang bukan approver    |
| 409  | `Action is not allowed from status "..."`                                                  | Approve/reject request yang bukan `pending`     |
| 404  | `Inventory request not found`                                                              | ID tidak ada                                    |
| 409  | `Inventory request is already approve` / `... already reject`                              | Edit/approve/reject request yang sudah diproses |

Pesan error ada di field `message` pada response.

Dua error approval (`You are not allowed ...` dan `Action is not allowed ...`) hanya muncul kalau backend menjalankan `APPROVAL_ENFORCE=true`. Selama belum aktif, approve/reject oleh siapa pun tetap berhasil, tapi request yang sudah diproses tetap ditolak dengan `Inventory request is already ...`.
