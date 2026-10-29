# Approval Flow dan My Task

Approval flow menentukan posisi mana yang boleh melakukan action pada dokumen di status tertentu, baik approve/reject maupun step proses seperti signing atau pembayaran. Satu set tabel dipakai untuk semua fitur:

- `approval_flows`: satu baris per kombinasi `approval_for` + `status` yang menunggu action.
- `approval_flow_positions`: posisi yang boleh melakukan action untuk baris tersebut.

Transisi status (dari → ke) tetap diatur di kode masing-masing fitur. Tabel ini hanya mengatur siapa yang boleh action.

## Fitur, status, dan action

| `approval_for`    | Status            | Action yang ditunggu                 | Endpoint                                                      |
| ----------------- | ----------------- | ------------------------------------ | ------------------------------------------------------------- |
| `service pricing` | `pending`         | Approve / reject                     | `PATCH /service-pricing/approve/:id`, `/reject/:id`           |
| `quotation`       | `pending`         | Approve / reject                     | `PATCH /quotations/approve/:id`, `/reject/:id`                |
| `purchase order`  | `pending`         | Approve / reject                     | `PATCH /pre-orders/approve/:id`, `/reject/:id`                |
| `contract`        | `pending`         | Submit | `PATCH /contracts/submit/:id` |
| `contract`        | `on verification` | Approve / reject                     | `PATCH /contracts/approve/:id`, `/reject/:id`                 |
| `contract`        | `approved`        | Kirim ke customer                    | `PATCH /contracts/send-to-customer/:id`                       |
| `contract`        | `sending to customer` | Approve / reject oleh customer   | `PATCH /contracts/approve-customer/:id`, `/reject-customer/:id` |
| `invoice`         | `pending`         | Submit | `PATCH /invoices/submit/:id` |
| `invoice`         | `on verification` | Approve / reject                     | `PATCH /invoices/approve/:id`, `/reject/:id`                  |
| `invoice`         | `waiting for payment` | Upload bukti bayar (Sales)       | `PATCH /invoices/upload-payment/:id`                          |
| `invoice`         | `payment verification` | Terima / tolak bukti bayar (AR & AP) | `PATCH /invoices/payment-accept/:id`, `/payment-reject/:id` |
| `invoice`         | `payment proof rejected` | Upload ulang bukti bayar (Sales) | `PATCH /invoices/upload-payment/:id`                       |
| `invoice`         | `revision requested` | Revisi PPh / tolak permintaan revisi (AR & AP) | `PATCH /invoices/revise/:id`, `/revision-request-reject/:id` |
| `invoice`         | `waiting for revision` | Approve / reject revisi (SPV FAT Internal) | `PATCH /invoices/revision-approve/:id`, `/revision-reject/:id` |
| `invoice tax invoice` | `requested` (kolom `tax_invoice_status`) | Upload faktur pajak (AR & AP) | `PATCH /invoices/tax-invoice/:id` |
| `debit note`      | `pending`         | Submit | `PATCH /debit-notes/submit/:id` |
| `debit note`      | `on verification` | Approve / reject                     | `PATCH /debit-notes/approve/:id`, `/reject/:id`               |
| `debit note`      | `approved`        | Catat pembayaran                     | `PATCH /debit-notes/paid/:id`                                 |
| `vendor`          | `pending`         | Approve / reject                     | `PATCH /vendors/approve/:id`, `/reject/:id`                   |
| `vendor revision` | `pending`         | Approve / reject revisi vendor       | `PATCH /vendor-edits/approve/:id`, `/reject/:id`              |
| `payment request` | `pending`, `approve dept manager`, `approve fat`, `approve manager fat`, `approve director` | Approve / reject | `PATCH /payment-requests/approve/:id`, `/reject/:id` |
| `payment request` | `approve cashier` | Catat pembayaran                     | `PATCH /payment-requests/paid/:id`                            |
| `inventory request` | `pending`       | Approve / reject                     | `PATCH /inventory-requests/approve/:id`, `/reject/:id`        |

Scope yang didukung: `division` untuk service pricing, `department` untuk payment request, vendor, dan vendor revision. Fitur lain selalu `all`.

`invoice tax invoice` membaca kolom `invoices.tax_invoice_status`, bukan `status`, karena faktur pajak berjalan berdampingan dengan status pembayaran invoice. Di `GET /invoices`, flag-nya muncul sebagai `is_can_upload_tax_invoice` dan `tax_invoice_action_label`, di samping `is_can_approve_reject`.

Dua aksi Sales invoice yang bersifat opsional dicek terhadap flow `invoice` / `waiting for payment` (posisi Sales), bukan status invoice saat itu: request faktur pajak (`PATCH /invoices/tax-invoice-request/:id`, terbuka di semua status setelah approve SPV) dan permintaan revisi (`PATCH /invoices/revision-request/:id`).

Yang tidak diatur di sini: revisi quotation, karena itu action pembuat dokumen; serta incoming invoice/debit note.

## Field `approval_flows`

| Field       | Isi                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`     | Penjelasan action untuk admin di halaman setting, misalnya `Approve / Reject Service Pricing` untuk service pricing berstatus `pending`. Label default setiap status bisa diambil dari `GET /api/approval-flows/targets`. |
| `rule_type` | Saat ini hanya `any`: cukup satu approver dari posisi yang terdaftar.                                                                                                                |
| `scope`     | `all` (default), `department`, atau `division`. Approver hanya bisa action pada dokumen dari department/divisi miliknya. Kalau fitur tidak mendukung scope tersebut, berlaku `all`. |

`GET /api/approval-flows?group_by=approval_for` mengembalikan flow aktif yang dikelompokkan per fitur: `[{ approval_for, label, approval_flows: [...] }]`. Urutan fitur dan status mengikuti tabel di atas, dan pagination tidak dipakai dalam mode ini. Tanpa `group_by`, response sama seperti sebelumnya.

`GET /api/approval-flows/targets` mengembalikan daftar fitur beserta status, label default, dan scope yang didukung, untuk mengisi dropdown di form setting.

`POST /api/approval-flows` dan `PUT /api/approval-flows/:id` menolak `approval_for`/`status` di luar tabel di atas, dan menolak duplikat `approval_for` + `status` yang masih aktif.

## Pengecekan saat action

Semua endpoint di tabel di atas mengecek dua hal:

1. Status dokumen saat ini sesuai dengan action. Kalau tidak, API mengembalikan error 409.
2. Posisi user terdaftar di flow untuk status itu, sesuai scope-nya. Kalau tidak, API mengembalikan error 403.

Posisi, department, dan divisi user dibaca dari database, jadi perubahan langsung berlaku tanpa login ulang.

Pengecekan ini hanya memblokir kalau env `APPROVAL_ENFORCE=true`. Selain itu, pelanggaran hanya dicatat di log server dan flow tetap berjalan seperti sebelumnya.

## Endpoint untuk frontend

| Endpoint                                            | Isi                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/my-tasks`                                 | Jumlah dokumen yang menunggu action user, per fitur: `{ total, summary: [{ approval_for, label, total }] }` |
| `GET /api/my-tasks?approval_for=invoice&page=1&limit=10` | Daftar dokumen satu fitur dengan pagination. Setiap baris memuat `approval_for`, `document_no`, `action_label` (label flow untuk status dokumen, misalnya `Signing Invoice`), dan `is_can_approve_reject: true`. |
| `GET /api/my-tasks/can-act?approval_for=invoice&id=5` | `{ is_can_approve_reject }` untuk satu dokumen, misalnya untuk menampilkan tombol di halaman detail. |

### Flag di GET biasa

`GET` list dan detail semua fitur di atas (`/service-pricing`, `/quotations`, `/pre-orders`, `/contracts`, `/invoices`, `/debit-notes`, `/vendors`, `/vendor-edits`, `/payment-requests`, `/inventory-requests`) menambahkan dua field di setiap dokumen:

| Field                   | Isi                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `is_can_approve_reject` | `true` kalau user yang login boleh melakukan action di status dokumen saat ini, termasuk step proses seperti signing dan input payment. Tampilkan tombol action hanya kalau nilainya `true`. |
| `action_label`          | Action yang ditunggu di status itu, misalnya `Signing Invoice`, siapa pun yang boleh melakukannya. `null` kalau statusnya tidak menunggu action. |

Aturannya sama dengan pengecekan di endpoint action, termasuk scope. Kalau data approval flow gagal dimuat, GET tetap berhasil dengan `is_can_approve_reject: false`.

## Setup

1. Jalankan `npm run db:setup-approval-flows` sebelum deploy kode ini. Script menambah kolom `approval_flows.scope` di kedua database, lalu membuat flow untuk posisi `developer` di setiap status yang belum punya flow. Flow yang sudah ada tidak diubah. Nama posisi lain bisa diberikan sebagai argumen: `node scripts/setup-approval-flows.js "Nama Posisi"`.
2. Setelah posisi approver yang sebenarnya diisi lewat `/api/approval-flows`, set `APPROVAL_ENFORCE=true`.
