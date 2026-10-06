# GA Purchase Order: Daftar Status dan Aksi

Semua endpoint berawalan `/api/ga-purchase-orders`. Setiap aksi memakai `PATCH` dan mengembalikan detail order terbaru.

## Daftar status

| Status                      | Arti / menunggu siapa                                                                     | Tombol yang tampil                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `request ga manager`        | Menunggu approval HRGA SPV/Manager. Order masih bisa diedit oleh pembuatnya (`PUT /:id`). | Approve / Reject (GA Manager)                         |
| `request director`          | Menunggu approval Direktur                                                                | Approve / Reject (Direktur)                           |
| `request ar ap`             | Menunggu approval AR/AP                                                                   | Approve / Reject (AR/AP)                              |
| `request fat`               | Menunggu approval Internal FAT SPV/Manager                                                | Approve / Reject (FAT)                                |
| `request cashier`           | Menunggu kasir melakukan pembayaran                                                       | Approve + form pembayaran / Reject (Kasir)            |
| `request receiving`         | Menunggu GA Staff mengunggah bukti pembelian dan penerimaan barang                        | Simpan data penerimaan, Accepted, Returned (GA Staff) |
| `return request ga manager` | Alur return: menunggu approval HRGA SPV/Manager                                           | Approve / Reject (GA Manager)                         |
| `return request ar ap`      | Alur return: menunggu approval AR/AP                                                      | Approve / Reject (AR/AP)                              |
| `return request cashier`    | Alur return: menunggu approval kasir                                                      | Approve / Reject (Kasir)                              |
| `finished`                  | Selesai, barang diterima                                                                  | Tidak ada                                             |
| `rejected ga manager`       | Ditolak HRGA SPV/Manager                                                                  | Tidak ada                                             |
| `rejected director`         | Ditolak Direktur                                                                          | Tidak ada                                             |
| `rejected ar ap`            | Ditolak AR/AP                                                                             | Tidak ada                                             |
| `rejected fat`              | Ditolak FAT                                                                               | Tidak ada                                             |
| `rejected cashier`          | Ditolak kasir                                                                             | Tidak ada                                             |

Status `rejected ...` dan `finished` adalah status akhir. Alur ini tidak lagi memakai status `approved`.

## Alur utama

```
request ga manager → request director → request ar ap → request fat
  → request cashier → request receiving → finished
```

## Alur return (setelah GA Staff menekan Returned)

```
request receiving → return request ga manager → return request ar ap
  → return request cashier → request receiving
```

Setelah alur return selesai, GA Staff kembali ke `request receiving` dan memilih Accepted atau Returned lagi. Direktur dan FAT tidak ikut di alur return. Kalau ada yang reject saat alur return, status kembali ke `request receiving`, bukan `rejected`.

## Endpoint per aksi

| Aksi                                        | Endpoint                                                        | Status awal yang diizinkan                        |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| GA Manager approve / reject                 | `PATCH /ga-manager/approve/:id`, `PATCH /ga-manager/reject/:id` | `request ga manager`, `return request ga manager` |
| Direktur approve / reject                   | `PATCH /director/approve/:id`, `PATCH /director/reject/:id`     | `request director`                                |
| AR/AP approve / reject                      | `PATCH /ar-ap/approve/:id`, `PATCH /ar-ap/reject/:id`           | `request ar ap`, `return request ar ap`           |
| FAT approve / reject                        | `PATCH /fat/approve/:id`, `PATCH /fat/reject/:id`               | `request fat`                                     |
| Kasir approve / reject                      | `PATCH /cashier/approve/:id`, `PATCH /cashier/reject/:id`       | `request cashier`, `return request cashier`       |
| Simpan data penerimaan (tanpa ganti status) | `PUT /:id/receiving`                                            | `request receiving`                               |
| GA Staff Accepted                           | `PATCH /ga-staff/accept/:id`                                    | `request receiving`                               |
| GA Staff Returned                           | `PATCH /ga-staff/return/:id`                                    | `request receiving`                               |

Kalau aksi dipanggil dari status yang tidak sesuai, API mengembalikan error 409.

## Body request

**Approve biasa** (opsional):

```json
{ "note": "Catatan" }
```

**Reject**: `note` wajib diisi.

```json
{ "note": "Alasan penolakan" }
```

**Kasir approve saat `request cashier`**: `payment_amount`, `payment_date`, dan minimal satu file di `files_payment` wajib diisi. Saat `return request cashier`, cukup `note` (opsional).

```json
{
  "payment_amount": 6660000,
  "payment_date": "2026-10-06",
  "payment_note": "Transfer BCA",
  "files_payment": []
}
```

**Simpan data penerimaan / Accepted / Returned**: semua field opsional di body. Kirim hanya field yang ingin disimpan atau diubah.

```json
{
  "received_date": "2026-10-06",
  "receipt_note": "Barang diterima lengkap",
  "files_purchase_proof": [],
  "files_goods_receipt": []
}
```

- **Accepted** baru berhasil kalau `received_date`, minimal satu `files_purchase_proof`, dan minimal satu `files_goods_receipt` sudah tersimpan. Data ini bisa dikirim sebelumnya lewat `PUT /:id/receiving` atau bersama tombol Accepted.
- **Returned** wajib mengisi `note` berisi alasan return.

## Field baru di response `GET /:id`

| Field                                            | Isi                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `payment_amount`, `payment_date`, `payment_note` | Data pembayaran dari kasir                                                         |
| `received_date`, `receipt_note`                  | Data penerimaan barang dari GA Staff                                               |
| `return_count`                                   | Berapa kali barang sudah di-return                                                 |
| `files_payment`                                  | Bukti bayar dari kasir                                                             |
| `files_purchase_proof`                           | Bukti pembelian dari GA Staff                                                      |
| `files_goods_receipt`                            | Form penerimaan barang dari GA Staff                                               |
| `verification_progress`                          | Riwayat semua aksi (status, user, note, waktu). Bisa ditampilkan sebagai timeline. |

Format setiap file sama dengan file lain: `original_name`, `stored_name`, `url`, `mime_type`, `size`. `indonesian_name` dan `mandarin_name` opsional. Saat update, sertakan `id` file lama yang ingin dipertahankan. File yang tidak dikirim akan dihapus.

## Catatan untuk frontend

- API belum membatasi role. Frontend yang perlu menampilkan tombol sesuai role user.
- Belum ada notifikasi otomatis. Untuk menampilkan riwayat, termasuk ke Direktur dan FAT saat ada return, gunakan `verification_progress`.
