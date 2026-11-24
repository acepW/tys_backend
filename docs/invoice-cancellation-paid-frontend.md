# Panduan Frontend: Cancel Invoice yang Sudah Bayar / Terbit Faktur Pajak

Pembatalan invoice yang **sudah ada pembayaran diterima** dan/atau **FP-nya sudah diminta atau terbit**, beserta Credit Note, refund, pemakaian deposit, dan report-nya. Invoice yang belum dibayar sama sekali dan FP-nya belum diminta tetap memakai Cancel/Konversi Proforma (bagian 11 di [invoice-frontend.md](invoice-frontend.md)).

Rancangan dan keputusannya: [invoice-cancellation-paid.md](invoice-cancellation-paid.md). Semua endpoint berawalan `/api` dan wajib login. File di-upload dulu lewat `POST /api/uploads/invoice/single|multiple`, lalu objek file hasilnya dikirim apa adanya di field array file (sama seperti invoice).

## Ringkasan alur

```text
Sales ajukan ─► waiting ar&ap review ─AR & AP approve─► waiting spv fat internal approval ─SPV approve─► waiting vice director approval
 ▲     │            │  └─ tahan ─► waiting outstanding settlement ─AR & AP approve / tolak                                │ Wakil Direktur approve
 │     │            └─ tolak ─► rejected ─Sales ajukan ulang─┘   (atau tarik ─► withdrawn)                                  ▼
 │     │                                                                                                    waiting director approval
 │   SPV / Wakil Direktur / Direktur tolak ─► kembali satu tahap                                                        │ Direktur approve
 │                                                                                                                      ▼
 │                    ┌─ pengalihan ─► waiting for payment transfer ─AR & AP proses (Credit Note)───────────────► completed
 │                    ├─ refund ─────► waiting for refund process ─AR & AP buat Payment Request─► waiting for cashier payment ─kasir bayar─► completed
 │                    │                      ▲                                                        │ kasir tolak
 │                    │                      └────────────────────────────────────────────────────────┘
 │                    └─ tanpa dana yang dikembalikan ─────────────────────────────────────────────────────────────► completed
completed: invoice cancelled (FP cancelled, debit note cancelled kalau dipilih)
```

Selama pengajuan berjalan, invoice berstatus **`paid cancellation in progress`** dan semua aksi invoice lain (upload bukti bayar, FP, bukti potong, revisi) ditolak backend. Sembunyikan tombol-tombol itu.

## Status pengajuan dan tombol

Data pengajuan ada di `/api/invoice-paid-cancellations`. Setiap baris list/detail membawa `is_can_approve_reject` (user ini boleh beraksi di status sekarang) dan `action_label` (nama aksi yang ditunggu). Tampilkan tombol hanya kalau `is_can_approve_reject === true`.

| `status` | Arti | Pelaku | Tombol |
| --- | --- | --- | --- |
| `waiting ar&ap review` | Menunggu review AR & AP | AR & AP | Approve, Reject, Tahan (outstanding) |
| `waiting outstanding settlement` | Ditahan sampai outstanding klien lunas | AR & AP | Approve, Reject |
| `rejected` | Ditolak AR & AP, kembali ke Sales (alasan di `note`) | Sales | Ajukan Ulang, Tarik |
| `waiting spv fat internal approval` | Menunggu SPV FAT Internal | SPV FAT Internal | Approve, Reject |
| `waiting vice director approval` | Menunggu Wakil Direktur | Wakil Direktur | Approve, Reject |
| `waiting director approval` | Menunggu Direktur | Direktur | Approve, Reject |
| `waiting for payment transfer` | Disetujui, menunggu AR & AP mengalihkan dana | AR & AP | Proses Pengalihan |
| `waiting for refund process` | Disetujui, menunggu AR & AP membuat Payment Request refund (juga setelah kasir menolak) | AR & AP | Buat Refund |
| `waiting for cashier payment` | Payment Request refund menunggu kasir | Kasir (di halaman Payment Request) | Tidak ada di halaman ini |
| `completed` | Selesai, invoice `cancelled` | - | Tidak ada |
| `withdrawn` | Ditarik Sales, invoice kembali ke status sebelumnya | - | Tidak ada |

Label status di dokumen klien untuk tampilan:

| `status` | Label |
| --- | --- |
| `waiting ar&ap review` | Waiting For AR & AP Review |
| `waiting outstanding settlement` | Waiting Outstanding Settlement |
| `rejected` | Rejected |
| `waiting spv fat internal approval` | Waiting For SPV FAT Internal Approval |
| `waiting vice director approval` | Waiting For Vice Director Approval |
| `waiting director approval` | Waiting For Director Approval |
| `waiting for payment transfer` | Waiting For Payment Transfer |
| `waiting for refund process` | Waiting For Refund Process |
| `waiting for cashier payment` | Waiting For Cashier Payment |
| `completed` | `settlement` `transfer`: Cancelled - Payment Transferred; `refund`: Cancelled - Refunded; `none`: Completed |

## 1. Tombol dan pop up sebelum mengajukan (Sales)

Tampilkan tombol **Invoice Cancellation Request** di detail invoice, lalu ambil preview saat diklik:

```http
GET /api/invoices/:id/paid-cancellation/preview
```

```json
{
  "id_invoice": 12,
  "invoice_no": "012/INV/TYS/XI/2026",
  "is_eligible": true,
  "reasons": [],
  "invoice_total": 1000000,
  "invoice_paid": 1000000,
  "invoice_kept": 500000,
  "invoice_max_amount": 500000,
  "tax_invoice_status": "issued",
  "needs_tax_invoice_confirmation": true,
  "debit_note": {
    "id": 20, "debit_note_no": "DN-20", "status": "paid", "total": 50000,
    "amount_if_cancelled": 50000, "can_be_cancelled": true
  },
  "transfer_targets": {
    "invoices": [{ "id": 2, "invoice_no": "002/INV/TYS/XI/2026", "status": "waiting for payment", "total": "300000.00", "payment_amount": "100000.00", "remaining": 200000, "id_contract": 6, "id_pre_order": null }],
    "debit_notes": [{ "id": 21, "debit_note_no": "DN-21", "status": "approved", "total": "50000.00", "remaining": 50000 }]
  }
}
```

- `is_eligible === false`: tampilkan `reasons[0]` dan jangan buka form. Alasan yang umum: klien belum membayar 50%, status invoice sedang diproses pihak lain, atau invoice belum pernah dibayar dan FP belum diminta (pakai Cancel Proforma).
- **Ketentuan pembatalan** (pilihan `service_condition`): tampilkan ketiga pilihan dari dokumen klien. Hanya `not processed` yang bisa diajukan; dua lainnya ditolak backend (409) dengan penjelasannya.
- **Pop up debit note** (kalau `debit_note` tidak `null`): "Invoice yang diajukan untuk pembatalan memiliki Debit Note terkait. Apakah Debit Note tersebut juga akan diajukan untuk pembatalan?" Yes → `cancel_debit_note: true`, No → `false`. Kalau `can_be_cancelled === false`, debit note sedang dibatalkan lewat pengajuan lain; hanya No yang bisa dipilih.
- **Pop up FP** (kalau `needs_tax_invoice_confirmation`): "Faktur Pajak sudah terbit, anda yakin akan membatalkan invoice dan faktur pajak?" Yes → `confirm_tax_invoice_cancel: true`.
- **Nominal**: dana invoice maksimal `invoice_max_amount` (pembayaran diterima − 50% total). Dana debit note, kalau dibatalkan dan sudah dibayar, selalu penuh (`amount_if_cancelled`), tidak bisa diubah. Kalau keduanya 0, tidak ada pilihan penyelesaian.

## 2. Ajukan pembatalan (Sales)

```http
PATCH /api/invoices/paid-cancellation-request/:id
```

| Field | Wajib | Isi |
| --- | --- | --- |
| `service_condition` | Ya | `not processed`, `processed without certificate`, atau `processed with certificate` |
| `reason` | Ya | Alasan pembatalan |
| `cancellation_attachment` | Ya | Array file, dokumen pendukung |
| `confirm_tax_invoice_cancel` | Kalau FP `issued` | `true` |
| `cancel_debit_note` | Kalau ada debit note | `true` / `false` |
| `invoice_amount` | Tidak | Dana invoice yang dikembalikan/dialihkan, ≤ `invoice_max_amount`. Default: maksimal |
| `settlement` | Kalau ada dana | `transfer` (Pengalihan Pembayaran) atau `refund` |
| `transfer_targets` | Untuk `transfer` | `[{ "type": "invoice" \| "debit_note", "id", "amount" }]` dari `transfer_targets` preview. Dana invoice hanya ke invoice, dana debit note hanya ke debit note. Debit note tujuan harus dibayar penuh (`amount` = `remaining`). Sisa yang tidak dialokasikan menjadi **Credit Note Deposit**. Kosong/tidak dikirim = semuanya deposit |
| `refund_bank_name`, `refund_account_name`, `refund_account_number` | Untuk `refund` | Rekening klien |
| `refund_letter` | Untuk `refund` | Array file, Surat Pengajuan Refund dari klien |
| `tax_invoice_credited` | Untuk `refund` + FP `issued` | Apakah klien sudah mengkreditkan FP |
| `tax_return_note` | Kalau `tax_invoice_credited` | Array file, Nota Retur Faktur Pajak |

Contoh pengalihan:

```json
{
  "service_condition": "not processed",
  "reason": "Klien membatalkan jasa sebelum diproses",
  "cancellation_attachment": [{ "url": "/files/invoice/a.pdf", "original_name": "a.pdf", "stored_name": "a.pdf", "mime_type": "application/pdf", "size": 1 }],
  "confirm_tax_invoice_cancel": true,
  "cancel_debit_note": true,
  "invoice_amount": 500000,
  "settlement": "transfer",
  "transfer_targets": [
    { "type": "invoice", "id": 2, "amount": 200000 },
    { "type": "debit_note", "id": 21, "amount": 50000 }
  ]
}
```

Response: detail pengajuan (bagian 3). Sejak saat ini invoice `paid cancellation in progress`.

## 3. List dan detail pengajuan

```http
GET /api/invoice-paid-cancellations?status=waiting ar&ap review,rejected&page=1&limit=10
GET /api/invoice-paid-cancellations/:id
```

Filter list: `status` (boleh beberapa, dipisah koma), `id_invoice`, `id_customer`, `id_company`, `search` (nomor invoice), `page` + `limit`. Tugas yang menunggu user juga muncul di My Task dengan `approval_for` `invoice paid cancellation`.

Field penting di detail:

| Field | Isi |
| --- | --- |
| `invoice`, `customer`, `company`, `debit_note` | Ringkasan dokumen |
| `service_condition`, `reason`, `settlement`, `transfer_targets` | Isi pengajuan |
| `invoice_total`, `invoice_paid`, `invoice_kept`, `invoice_amount`, `debit_note_paid`, `debit_note_amount` | Angka saat diajukan |
| `refund_bank_name`, `refund_account_name`, `refund_account_number`, `tax_invoice_credited` | Data refund |
| `note` | Catatan tolak/tahan terakhir |
| `cancellation_attachment`, `refund_letter`, `tax_return_note`, `transfer_proof` | File |
| `user_request`, `user_review`, `user_verify`, `user_vice_approve`, `user_approve` + `reviewed_at`, `verified_at`, `vice_approved_at`, `approved_at`, `completed_at` | Siapa dan kapan |
| `progress` | Riwayat pengajuan ini (status `paid cancellation ...`, lampiran tolak di `paid_cancellation_reject_attachment`) |
| `credit_notes` | Credit Note hasil pengalihan, dengan `allocations` |
| `payment_request`, `refund_payment_requests` | Payment Request refund yang berjalan, dan semua termasuk yang ditolak kasir |

`GET /api/invoices/:id` juga memuat `paid_cancellations` (semua pengajuan invoice itu).

## 4. Approve, reject, tahan (AR & AP, SPV FAT Internal, Wakil Direktur, Direktur)

```http
PATCH /api/invoice-paid-cancellations/approve/:id    { "note": "opsional" }
PATCH /api/invoice-paid-cancellations/reject/:id     { "note": "wajib", "reject_attachment": [file, ...] }
PATCH /api/invoice-paid-cancellations/hold/:id       { "note": "wajib: outstanding yang harus dilunasi dulu" }
```

- Endpoint yang sama untuk semua tahap; backend memakai status pengajuan saat itu.
- Tolak AR & AP → `rejected` (ke Sales). Tolak SPV → `waiting ar&ap review`; Wakil Direktur → `waiting spv fat internal approval`; Direktur → `waiting vice director approval`.
- **Tahan** hanya dari `waiting ar&ap review`. Untuk membantu AR & AP mengecek outstanding klien, pakai list invoice/debit note customer yang sama (`GET /api/invoices?id_customer=...&status=waiting for payment`).
- Approve Direktur: `settlement` `transfer` → `waiting for payment transfer`, `refund` → `waiting for refund process`, `none` → langsung `completed`.

## 5. Ajukan ulang atau tarik (Sales, dari `rejected`)

```http
PUT   /api/invoice-paid-cancellations/resubmit/:id   (body lengkap seperti bagian 2; file diganti dengan yang dikirim)
PATCH /api/invoice-paid-cancellations/withdraw/:id   { "note": "opsional" }
```

Untuk form ajukan ulang, ambil lagi `GET /api/invoices/:id_invoice/paid-cancellation/preview` untuk angka dan tujuan pengalihan terbaru (`is_eligible` bisa `false` karena invoice sedang terkunci oleh pengajuan ini; abaikan untuk form ajukan ulang). Tarik mengembalikan invoice ke status sebelum pengajuan.

## 6. Proses pengalihan pembayaran (AR & AP, 7A)

```http
PATCH /api/invoice-paid-cancellations/process-transfer/:id
```

| Field | Wajib | Isi |
| --- | --- | --- |
| `transfer_proof` | Ya | Array file, bukti pengalihan pembayaran |
| `allocations` | Ya | `[{ "type", "id", "amount", "payment_proof": [file, ...] }]`. Isi awal dari `transfer_targets` pengajuan, tetapi AR & AP boleh mengubahnya (tujuan bisa sudah dibayar sejak diajukan; cek dengan preview tujuan di bawah). Bukti bayar wajib per tujuan. `[]` = semua menjadi deposit |
| `transfer_date` | Tidak | `YYYY-MM-DD`, tanggal pembayaran di dokumen tujuan. Default hari ini |
| `note` | Tidak | Catatan di Credit Note |

Untuk daftar tujuan terbaru, pakai `transfer_targets` dari `GET /api/invoices/:id_invoice/paid-cancellation/preview`.

Hasil: satu Credit Note per dokumen asal yang punya dana (nomor `001/CN/TYS/XI/2026`), invoice tujuan mendapat pembayaran diterima (metode `credit note`), debit note tujuan `paid`, sisa menjadi saldo deposit, pengajuan `completed`, invoice asal `cancelled`. Response: detail pengajuan dengan `credit_notes`.

## 7. Refund (AR & AP, lalu kasir, 7B)

AR & AP:

```http
PATCH /api/invoice-paid-cancellations/create-refund/:id
```

```json
{ "refund_account_number": "1234567890", "priority": "normal", "note": "opsional" }
```

Semua field opsional: rekening default dari Sales (isi untuk mengoreksi), `priority` `normal` (default) atau `urgent`. Backend membuat Payment Request `payment_type: "refund"` sebesar dana invoice + dana debit note, langsung berstatus `approve cashier`. Pengajuan menjadi `waiting for cashier payment`.

Kasir memakai halaman Payment Request yang sudah ada:

- **Bayar**: `PATCH /api/payment-requests/paid/:id` (seperti Payment Request lain). Pengajuan otomatis `completed` dan invoice `cancelled`.
- **Tolak**: `PATCH /api/payment-requests/reject/:id` dengan catatan. Pengajuan kembali ke `waiting for refund process` (alasan di `note` pengajuan); AR & AP membuat Payment Request baru.

Di halaman Payment Request, request dengan `payment_type === "refund"` (atau `id_invoice_paid_cancellation` terisi) **tidak bisa diedit, dihapus, atau di-approve** (409). Sembunyikan tombol Edit/Hapus/Approve; tampilkan tautan ke pengajuan pembatalannya.

## 8. Pakai saldo deposit Credit Note (AR & AP)

Di detail invoice (`waiting for payment` / `payment proof rejected`) atau debit note (`approved`), tampilkan tombol **Bayar dari Credit Note** kalau ada deposit:

```http
GET /api/credit-notes/deposits?target_type=invoice&id_target=5
```

```json
{
  "target_type": "invoice",
  "id_target": 5,
  "number": "005/INV/TYS/XI/2026",
  "remaining": 400000,
  "must_pay_in_full": false,
  "credit_notes": [
    { "id": 1, "credit_note_no": "001/CN/TYS/XI/2026", "date": "2026-11-24T03:00:00.000Z", "amount": "500000.00", "balance": "300000.00", "source_type": "invoice", "invoice": { "id": 12, "invoice_no": "012/INV/TYS/XI/2026" }, "debit_note": null }
  ]
}
```

Hanya Credit Note customer, company, dan mata uang yang sama, dan sejenis (deposit dari invoice untuk invoice, dari debit note untuk debit note). Kalau `credit_notes` kosong, sembunyikan tombolnya.

```http
PATCH /api/invoices/credit-note-payment/:id
PATCH /api/debit-notes/credit-note-payment/:id
```

```json
{ "id_credit_note": 1, "amount": 300000, "payment_date": "2026-11-24", "payment_proof": [], "note": "opsional" }
```

`amount` ≤ saldo Credit Note dan ≤ `remaining`; untuk debit note harus sama dengan `remaining` (`must_pay_in_full`). `payment_proof` opsional. Response: detail Credit Note (`GET /api/credit-notes/:id`). Refresh detail invoice/debit note setelahnya.

## 9. Report Credit Note

Semua mengembalikan JSON; export Excel dikerjakan frontend. Tanggal `YYYY-MM-DD`. Kalau `page` dan `limit` dikirim, response berbentuk `data` + `pagination`.

| Halaman | Endpoint | Kolom | Filter |
| --- | --- | --- | --- |
| Saldo per customer | `GET /api/report-credit-notes/balances` | Customer, Company, Mata uang, Asal (`source_type`), Jumlah CN (`credit_note_count`), Diterbitkan (`issued`), Dialihkan (`used_transfer`), Dipakai deposit (`used_deposit`), Saldo (`balance`), Aktivitas terakhir. Footer: `totals` per mata uang | `id_customer`, `id_company`, `currency_type`, `source_type`, `search`, `as_of` (saldo per tanggal), `has_balance` (`false` untuk ikut menampilkan saldo 0) |
| Daftar Credit Note | `GET /api/report-credit-notes` | No. CN, Tanggal, Customer, Asal (`source.number`, `source.contract_no` / `pre_order_no`), Penyelesaian, Nominal, Dialihkan, Deposit dipakai, Saldo, Status (`open` / `used up`) | `id_customer`, `id_company`, `currency_type`, `source_type`, `status`, `date_from`, `date_to`, `search` |
| Detail Credit Note | `GET /api/report-credit-notes/:id` | Bagian **Dari mana**: `source` dan `source.cancellation` (alasan, total, dibayar, 50% ditahan, approve Direktur). Bagian **Dipakai untuk apa**: `allocations` (tanggal, jenis, `target.number` + CT/PO, nominal, saldo berjalan, user, bukti) | - |
| Mutasi customer | `GET /api/report-credit-notes/ledger?id_customer=4&date_from=2026-11-01&date_to=2026-11-30` | Satu tabel per `ledgers[]` (company + mata uang + asal): saldo awal (`opening_balance`), baris (`date`, `kind`, `credit_note_no`, `document.number`, `description`, Masuk `amount_in`, Keluar `amount_out`, Saldo `balance`), saldo akhir (`closing_balance`) | `id_customer` wajib, `date_from`, `date_to`, `id_company`, `currency_type`, `source_type` |

Label `kind` di mutasi: `issued` = Credit Note terbit, `transferred` = Pengalihan, `used as deposit` = Pemakaian deposit.

## 10. Dampak ke halaman lain

| Halaman | Yang berubah |
| --- | --- |
| Invoice | Status baru `paid cancellation in progress` (label: Cancellation In Progress) — sembunyikan semua tombol aksi, tampilkan tautan ke pengajuan. `tax_invoice_status` bisa `cancelled` (FP dibatalkan). Detail memuat `paid_cancellations` |
| Invoice: pembayaran | `payments[].payment_method` bisa `credit note`, dengan `payments[].credit_note` (`credit_note_no`). Tampilkan "Credit Note 001/CN/..." sebagai pengganti bank |
| Invoice: riwayat | Status `paid cancellation requested`, `resubmitted`, `approved`, `held`, `rejected`, `withdrawn`, `refund requested`, `completed` |
| Debit note | Bisa `paid` dari Credit Note (riwayat `paid` dengan catatan nomor Credit Note); bisa `cancelled` bersama invoice. Selama pengajuan yang ikut membatalkannya berjalan, tombol bayar ditolak (409) |
| Payment Request | `payment_type` baru `refund`, tidak bisa diedit/dihapus/di-approve |
| Cancel Proforma (bagian 11 invoice-frontend) | Sejak 2026-11-24 bukti bayar yang ditolak tidak menghalangi; invoice dengan pembayaran diterima memakai alur ini |

## 11. Pesan error yang perlu ditangani

| HTTP | Contoh `message` | Arti |
| --- | --- | --- |
| 409 | `The client must pay at least 50% of the invoice (500000) before it is cancelled; 200000 more is needed` | Syarat 50% belum terpenuhi |
| 409 | `The invoice has no accepted payment and no tax invoice: use the cancellation request of an unpaid invoice` | Pakai Cancel Proforma |
| 409 | `Paid cancellation is not allowed while the invoice is wht verification` | Status invoice sedang diproses pihak lain |
| 409 | `A service already processed with its certificate issued cannot be cancelled and must be paid in full` | Ketentuan pembatalan 3 |
| 400 | `confirm_tax_invoice_cancel must be true: ...`, `cancel_debit_note must be a boolean: ...` | Pop up belum dijawab |
| 400 | `invoice_amount cannot be more than 500000 (payments above the 50% kept)` | Nominal melebihi batas |
| 400 | `transfer_targets[0] is not an outstanding invoice of the same customer, company and currency` | Tujuan tidak valid / sudah lunas |
| 400 | `transfer_targets[1].amount must pay the debit note in full (50000)` | Debit note harus lunas penuh |
| 409 | `Approving is not allowed while the cancellation is rejected` | Status sudah berubah; refresh |
| 409 | `This refund payment request no longer waits for the cashier` | Payment Request refund yang sudah ditolak/diganti |
| 409 | `A refund payment request of a cancelled invoice cannot be edited or deleted` | Edit/hapus Payment Request refund |
| 400 | `A credit note from an invoice can only pay an invoice` | Deposit beda jenis |
| 400 | `The amount cannot be more than the credit note's deposit 300000` | Melebihi saldo deposit |
