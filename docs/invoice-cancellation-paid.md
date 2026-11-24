# Rancangan: Cancel Invoice yang Sudah Bayar / Terbit Faktur Pajak

Rancangan untuk bagian **"Tahapan Cancel Invoice yang Sudah Bayar / Terbit Faktur Pajak"** di dokumen kebutuhan "Kebutuhan Sistem - FAT Internal (4)" (hal. 5–8). Progres alur invoice lainnya ada di [invoice-approval-fat.md](invoice-approval-fat.md).

**Status (2026-11-24): semua fase (A–G) selesai.** Panduan frontend: [invoice-cancellation-paid-frontend.md](invoice-cancellation-paid-frontend.md). Yang masih menunggu: posisi Wakil Direktur dan posisi tiap flow (admin), dan file template Surat Pengajuan Refund dari tim FAT (P10). Semua pertanyaan memakai default kecuali P5 (dijawab). Lihat [Implementasi fase A–B](#implementasi-fase-ab).

## Posisi terhadap alur yang sudah ada

| Kondisi invoice | Alur |
| --- | --- |
| Belum ada bukti bayar dan FP belum diminta | Tahap 5 yang sudah ada (cancel / konversi 50%, poin 6–6.3) |
| Sudah ada pembayaran diterima **dan/atau** FP sudah diminta/terbit | **Alur baru ini** |

Celah yang ditutup alur baru: saat ini invoice yang FP-nya sudah diminta/terbit tapi belum dibayar tidak bisa dibatalkan lewat jalur mana pun (per 2026-11-24 ada 1 invoice seperti ini: `waiting for payment` + FP `issued`).

## Ringkasan alur

```text
Sales ajukan (1–2.2) ─► AR & AP review (3) ─► SPV FAT Internal (4) ─► Wakil Direktur (5) ─► Direktur (6)
   ▲  │                   │  ├─ tolak ─► kembali ke Sales (perbaiki & ajukan ulang, atau tarik)
   │  └─ tarik            │  └─ tahan ─► waiting outstanding settlement ─► AR & AP lanjut / tolak
   │                      SPV / Wakil Direktur / Direktur tolak ─► kembali satu tahap
   │
   Direktur approve ─┬─ pengalihan ─► AR & AP buka Credit Note + alokasi + bukti (7A) ─► completed
                     ├─ refund ─────► AR & AP buat Payment Request ─► Kasir bayar + bukti (7B) ─► completed
                     └─ tanpa dana yang dikembalikan ─────────────────────────────────────────► completed
completed: invoice (dan debit note kalau ikut) menjadi cancelled
```

## Rancangan

### R1. Syarat pengajuan

- Status invoice salah satu dari `waiting for payment`, `payment proof rejected`, `paid waiting wht`, `wht rejected`, `paid & clear`. Tidak bisa diajukan saat ada pihak lain sedang memproses: `payment verification`, `wht verification`, `revision requested`, `waiting for revision`, dan status pembatalan Tahap 5.
- Sudah ada pembayaran diterima (`payment_amount > 0`) **atau** `tax_invoice_status` bukan `none`.
- **Pembayaran yang diterima minimal 50% dari `total` invoice** (aturan jawaban Tahap 5 no. 1: klien bayar 50% dulu sebelum cancel). Kalau kurang, ditolak 409 dengan sisa yang harus dibayar.
- Invoice hasil konversi 50% tidak bisa diajukan (lanjutan U7).
- Tidak ada pengajuan lain yang masih berjalan untuk invoice itu.
- Syarat addendum/pembatalan CT/PO (poin 1, "New QT based addendum") belum dicek, sama seperti keputusan 38.

### R2. Ketentuan pembatalan (poin 1)

Sistem belum mencatat proses jasa dan penerbitan sertifikat, jadi Sales memilih `service_condition`:

| Nilai | Ketentuan PDF | Hasil |
| --- | --- | --- |
| `not processed` | Jasa belum diproses: dana 50% bisa dikembalikan/dialihkan | Pengajuan diterima |
| `processed without certificate` | Sudah diproses, sertifikat belum terbit: tidak bisa batal, pelunasan tidak perlu ditagih | Ditolak 409 (lihat P3) |
| `processed with certificate` | Sudah diproses, sertifikat terbit: tidak bisa batal, wajib ditagih lunas | Ditolak 409 |

Kebenaran pilihan ini diperiksa AR & AP di tahap review.

### R3. Nominal yang dikembalikan/dialihkan

- Batas per dokumen = pembayaran diterima − 50% × `total`. Contoh: invoice 100 lunas → maksimal 50. Invoice 100 dibayar 70 → maksimal 20. Dibayar tepat 50 → 0.
- Sales mengisi `invoice_amount` (≤ batas). ~~Kalau debit note ikut dibatalkan dan sudah dibayar, Sales juga mengisi `debit_note_amount` dengan aturan yang sama (lihat P5).~~ Diubah 2026-11-24 (P5): debit note **tidak** kena aturan 50%. Kalau debit note ikut dibatalkan dan sudah dibayar, `debit_note_amount` = seluruh pembayaran debit note itu (diisi otomatis, tidak dipotong).
- Kalau semua nominal 0, tidak ada penyelesaian dana: setelah Direktur approve, pembatalan langsung `completed`.

### R4. Debit note (poin 1, pop up)

- Kalau invoice punya debit note (`id_debit_note`), Sales wajib mengisi `cancel_debit_note` (`true`/`false`), sama seperti U8.
- `true` (dibatalkan): debit note dikunci selama proses dan ikut `cancelled` saat pembatalan `completed`. Kalau sudah dibayar, seluruh pembayarannya ikut dialihkan/di-refund (R3).
- `false` (dilanjutkan): debit note tetap berlaku apa adanya, tidak dikunci, dan pembayarannya tidak ikut diselesaikan. Sama dengan pilihan di Tahap 5 (U8–U11).
- Pilihan ini sekarang juga berlaku untuk debit note yang sudah `paid` (di Tahap 5, U10 hanya mengizinkan `false` untuk debit note `paid` karena pembatalannya menunggu alur ini).
- Uang dari invoice hanya dialihkan ke invoice, uang dari debit note hanya ke debit note ("Wajib INV to INV, DN to DN").

### R5. Data pengajuan Sales (poin 1–2.2)

| Field | Wajib | Isi |
| --- | --- | --- |
| `service_condition` | Ya | R2 |
| `reason` | Ya | Alasan pembatalan (1.2) |
| `cancellation_attachment` | Ya | Dokumen pendukung, minimal 1 file (1.2) |
| `confirm_tax_invoice_cancel` | Kalau FP sudah `issued` | Harus `true`; jawaban pop up "Faktur Pajak sudah terbit, anda yakin…" (1.1) |
| `cancel_debit_note` | Kalau ada debit note | R4 |
| `settlement` | Kalau ada nominal | `transfer` (pengalihan) atau `refund` (2) |
| `invoice_amount`, `debit_note_amount` | Kalau ada nominal | R3 |
| `transfer_targets` | Untuk `transfer` | Daftar `{ type: invoice/debit_note, id, amount }` tujuan pengalihan (2.1 no. 1). Jumlahnya ≤ nominal; sisanya menjadi Credit Note Deposit (2.1 no. 2). Kosong = semuanya deposit |
| `refund_bank_name`, `refund_account_name`, `refund_account_number` | Untuk `refund` | Rekening klien, dipakai saat membuat Payment Request |
| `refund_letter` | Untuk `refund` | Surat Pengajuan Refund dari klien, sesuai template (2.2 no. 1) |
| `tax_invoice_credited` | Untuk `refund` + FP terbit | Apakah klien sudah mengkreditkan FP |
| `tax_return_note` | Kalau `tax_invoice_credited` | Nota Retur Faktur Pajak (2.2 no. 2) |

Tujuan pengalihan yang boleh dipilih: invoice atau debit note **customer, company, dan mata uang yang sama**, yang masih punya sisa tagihan dan tidak sedang dibatalkan (invoice `waiting for payment` / `payment proof rejected`; debit note `approved` yang belum dibayar).

Endpoint bantu `GET /invoices/:id/paid-cancellation/preview` mengembalikan: boleh diajukan atau tidak (dengan alasannya), batas nominal invoice dan debit note, ada debit note atau tidak, status FP (untuk pop up 1.1), dan daftar tujuan pengalihan yang boleh dipilih. Frontend memakainya untuk pop up dan pilihan di langkah 1–2.

### R6. Tahap approval dan status

Pengajuan disimpan di tabel baru `invoice_paid_cancellations`, satu baris per pengajuan (riwayat tetap ada). Status baris ini dipakai My Task lewat approval target baru `invoice paid cancellation`.

| Status pengajuan | Status PDF | Pelaku | Aksi |
| --- | --- | --- | --- |
| `waiting ar&ap review` | Cancellation Request Submitted / Waiting For AR & AP Review | AR & AP | approve → `waiting spv fat internal approval`; tolak → `rejected`; tahan → `waiting outstanding settlement` |
| `waiting outstanding settlement` | Waiting Outstanding Settlement (3.2) | AR & AP | approve (outstanding sudah lunas) atau tolak |
| `rejected` | Rejected (3.1) | Sales | perbaiki dan ajukan ulang → `waiting ar&ap review`, atau tarik → `withdrawn` |
| `waiting spv fat internal approval` | Waiting For SPV FAT Internal Approval | SPV FAT Internal | approve → `waiting vice director approval`; tolak → `waiting ar&ap review` (4.2) |
| `waiting vice director approval` | Waiting For Vice Director Approval | Wakil Direktur | approve → `waiting director approval`; tolak → `waiting spv fat internal approval` |
| `waiting director approval` | Waiting For Director Approval | Direktur | approve → lihat di bawah; tolak → `waiting vice director approval` |
| `waiting for payment transfer` | Waiting For Payment Transfer (7A) | AR & AP | proses pengalihan → `completed` |
| `waiting for refund process` | Waiting For Refund Process (7B) | AR & AP | buat Payment Request → `waiting for cashier payment` |
| `waiting for cashier payment` | Waiting For Cashier Payment (7B.2) | Kasir (lewat Payment Request) | Payment Request `paid` → `completed` |
| `completed` | Cancelled - Payment Transferred / Cancelled - Refunded / Completed | - | Status akhir |
| `withdrawn` | - | - | Status akhir; invoice kembali ke status sebelumnya |

Approve Direktur: `transfer` → `waiting for payment transfer`, `refund` → `waiting for refund process`, tanpa nominal → `completed`.

Status PDF yang hanya berarti "sedang diperiksa" (AR & AP Review, SPV FAT Internal Review, Vice Director Review, Director Review) tidak dibuat sebagai status sendiri. Setiap tolak wajib catatan; tolak AR & AP boleh dengan lampiran.

### R7. Invoice dan debit note selama proses

- Status invoice berubah menjadi status baru `paid cancellation in progress`. Status invoice sebelumnya disimpan di baris pengajuan dan dipulihkan kalau pengajuan ditarik. Selama status ini semua aksi invoice lain ditolak (upload bukti bayar, FP, bukti potong, revisi).
- Debit note yang ikut dibatalkan ditandai di baris pengajuan; pencatatan bayarnya ditolak selama proses (seperti 47d).
- Saat `completed`: invoice `cancelled`, debit note (kalau ikut) `cancelled`, `tax_invoice_status` → `cancelled` (nilai baru) kalau FP sudah terbit, atau `none` kalau baru diminta. Riwayat invoice mencatat cara penyelesaian dan nomor Credit Note / Payment Request.

### R8. Pengalihan pembayaran dan Credit Note (7A)

- Tabel baru `credit_notes`: nomor, company, customer, mata uang, dokumen asal (invoice atau debit note), pengajuan asal, nominal, **saldo deposit**, tanggal. Satu Credit Note per dokumen asal yang punya nominal (INV dan DN terpisah).
- Tabel baru `credit_note_allocations`: Credit Note, dokumen tujuan, nominal, pembayaran yang dihasilkan.
- Aksi AR & AP `PATCH /invoice-paid-cancellations/process-transfer/:id` (7A.1–7A.4):
  - mengirim alokasi final (boleh menyesuaikan pilihan Sales, karena tujuan bisa sudah dibayar klien sejak diajukan), bukti pengalihan (7A.2), dan bukti pembayaran per tujuan (7A.3);
  - sistem membuat Credit Note, lalu mencatat **pembayaran diterima** di invoice tujuan (baris `invoice_payments` dengan metode baru `credit note`). Pembayaran ini menjalankan logika yang sama dengan `payment-accept`: kalau lunas, invoice tujuan lanjut ke bukti potong / `paid & clear` dan meminta Final Invoice/FP;
  - debit note tujuan dicatat `paid` (lihat P6);
  - sisa yang tidak dialokasikan menjadi saldo deposit Credit Note (7A.1 no. 2);
  - pengajuan menjadi `completed` dan invoice asal `cancelled` (7A.4–7A.5).
- Penggunaan saldo deposit untuk invoice berikutnya ("mengurangi tagihan invoice yang akan dibukakan") masuk tahap terpisah (P8).
- Credit Note **terikat ke customer** (bersama company dan mata uangnya, P15). Saldo deposit bisa dipakai berkali-kali untuk invoice lain customer itu sampai habis, termasuk invoice yang dibuat belakangan. Credit Note dari invoice hanya untuk invoice, dari debit note hanya untuk debit note (P16).

### R9. Refund lewat Payment Request (7B)

- Aksi AR & AP `PATCH /invoice-paid-cancellations/create-refund/:id` (7B.1) membuat Payment Request baru:
  - `payment_type` baru `refund` dan kolom baru `id_invoice_paid_cancellation`;
  - nominal = `invoice_amount + debit_note_amount`, rekening dari data Sales (R5), keterangan menyebut nomor invoice/debit note;
  - **langsung berstatus `approve cashier`**, yaitu menunggu kasir input pembayaran, tanpa approval dept manager s.d. direktur lagi, karena pembatalannya sudah di-approve sampai Direktur (7B.2).
- Kasir memakai endpoint yang sudah ada `PATCH /payment-requests/paid/:id` dengan bukti bayar (7B.3–7B.4). Saat Payment Request itu `paid`, pengajuan pembatalan otomatis `completed` dan invoice `cancelled` (7B.5–7B.6), dalam transaksi yang sama.

### R10. Approval flow dan posisi

- Target baru `invoice paid cancellation` di `approvalTargets` dengan status di R6; flow dibuat lewat `npm run db:setup-approval-flows`, sementara posisi Developer seperti flow lain (`APPROVAL_ENFORCE` tetap `false`).
- Posisi **Wakil Direktur** belum ada di master position. Perlu dibuat (posisi lintas organisasi, sesuai [org-hierarchy.md](org-hierarchy.md)) sebelum flow-nya diatur ke posisi sebenarnya. Kasir memakai flow Payment Request `approve cashier` yang sudah ada.
- Aksi Sales (ajukan, ajukan ulang, tarik) memakai flow invoice `waiting for payment` (Sales) seperti request FP, lewat `actAs`.

### R11. Endpoint (usulan)

| Endpoint | Pelaku | Isi |
| --- | --- | --- |
| `GET /invoices/:id/paid-cancellation/preview` | Sales | R5 |
| `PATCH /invoices/paid-cancellation-request/:id` | Sales | Mengajukan (R5) |
| `GET /invoice-paid-cancellations`, `GET /invoice-paid-cancellations/:id` | Semua | List (filter status, customer, invoice) dan detail, dengan `is_can_approve_reject` / `action_label` untuk My Task |
| `PUT /invoice-paid-cancellations/resubmit/:id` | Sales | Perbaiki dan ajukan ulang dari `rejected` |
| `PATCH /invoice-paid-cancellations/withdraw/:id` | Sales | Tarik dari `rejected` |
| `PATCH /invoice-paid-cancellations/approve/:id` | AR & AP, SPV, Wakil Direktur, Direktur | Sesuai status (R6) |
| `PATCH /invoice-paid-cancellations/reject/:id` | Sama | Catatan wajib |
| `PATCH /invoice-paid-cancellations/hold/:id` | AR & AP | → `waiting outstanding settlement`, catatan wajib |
| `PATCH /invoice-paid-cancellations/process-transfer/:id` | AR & AP | R8 |
| `PATCH /invoice-paid-cancellations/create-refund/:id` | AR & AP | R9 |
| `GET /credit-notes` | AR & AP | List Credit Note dan saldo deposit |

`GET /invoices/:id` ikut memuat `paid_cancellations`. Bentuk final endpoint bisa berubah saat dikerjakan.

### R12. Database

Lewat `npm run db:sync-invoice-payments` (DB1 dan DB2): tabel `invoice_paid_cancellations`, `credit_notes`, `credit_note_allocations`; status invoice `paid cancellation in progress`; `tax_invoice_status` `cancelled`; metode `credit note` dan kolom `id_credit_note` di `invoice_payments`; `payment_type` `refund` dan kolom `id_invoice_paid_cancellation` di `payment_requests`; status progress baru di riwayat invoice.

### R13. Report Credit Note (diminta 2026-11-24)

Report lain di dokumen kebutuhan tetap ditunda. Report ini mengikuti pola `/api/report-invoices` yang sudah ada: backend mengembalikan JSON (pagination opsional dengan `page` + `limit`), tampilan dan export Excel dikerjakan frontend. Semua endpoint wajib login.

Sumber data: `credit_notes` (penerbitan) dan `credit_note_allocations` (pemakaian). Setiap alokasi menyimpan tanggal, jenisnya (`transfer`: pengalihan langsung saat pembatalan di 7A; `deposit`: pemakaian saldo deposit di invoice berikutnya, fase E), dokumen tujuan, user, dan bukti. Saldo di report **dihitung dari riwayat** (nominal − alokasi sampai tanggal tertentu), bukan dari kolom saldo, supaya bisa dilihat per tanggal.

**1. Saldo per customer** — `GET /api/report-credit-notes/balances`

Satu baris per customer + company + mata uang + jenis asal (invoice / debit note, karena deposit tidak bisa dicampur, P16).

| Kolom | Isi |
| --- | --- |
| Customer, Company, Mata uang, Asal | Pengelompokan |
| Jumlah Credit Note | Banyaknya Credit Note di kelompok itu |
| Total diterbitkan | Jumlah nominal Credit Note |
| Total dipakai | Jumlah alokasi (pengalihan + pemakaian deposit) |
| Saldo | Total diterbitkan − total dipakai |
| Aktivitas terakhir | Tanggal penerbitan/pemakaian terakhir |

Filter: `id_customer`, `id_company`, `currency_type`, `source_type`, `search` (nama customer), `as_of` (saldo per tanggal, default hari ini), `has_balance` (default `true`: hanya yang masih bersaldo). Response juga membawa total per mata uang.

**2. Daftar Credit Note** — `GET /api/report-credit-notes`

Satu baris per Credit Note: nomor dan tanggal, customer, company, mata uang, dokumen asal (nomor invoice/debit note dan CT/PO-nya), cara penyelesaian pembatalan, nominal, terpakai untuk pengalihan, terpakai sebagai deposit, saldo, status (`open` kalau saldo > 0, `used up` kalau 0). Filter: `id_customer`, `id_company`, `currency_type`, `source_type`, `status`, `date_from` / `date_to` (tanggal Credit Note), `search` (nomor Credit Note / invoice / debit note).

**3. Detail Credit Note** — `GET /api/report-credit-notes/:id`

- **Dari mana:** dokumen asal (nomor, CT/PO, total, pembayaran diterima, bagian 50% yang ditahan untuk invoice), pengajuan pembatalan (alasan, ketentuan, tanggal approve Direktur), dan user AR & AP yang memproses.
- **Dipakai untuk apa:** setiap alokasi berurutan tanggal: jenis (pengalihan / deposit), dokumen tujuan (nomor invoice/debit note dan CT/PO-nya), nominal, bukti, user, dan saldo berjalan.

**4. Mutasi per customer** — `GET /api/report-credit-notes/ledger?id_customer=&date_from=&date_to=`

Seperti kartu piutang: saldo awal pada `date_from`, lalu setiap penerbitan (+) dan pemakaian (−) berurutan tanggal dengan saldo berjalan, lalu saldo akhir. Dipisah per company + mata uang + jenis asal. Filter tambahan: `id_company`, `currency_type`.

Kalau invoice tujuan yang pernah dibayar dari Credit Note dibatalkan lagi lewat alur ini, Credit Note baru diterbitkan dengan asal invoice tersebut, jadi rantainya tetap terbaca di detail dan mutasi.

## Tahapan pengerjaan

| Fase | Isi | Status |
| --- | --- | --- |
| A | Tabel dan status (R12 bagian pengajuan), preview, pengajuan Sales, kunci invoice/debit note, ajukan ulang dan tarik (R1–R5, R7) | Selesai (2026-11-24) |
| B | Approval AR & AP (termasuk tahan), SPV, Wakil Direktur, Direktur, penolakan, My Task, approval flow, penyelesaian tanpa nominal (R6, R10) | Selesai (2026-11-24) |
| C | Pengalihan pembayaran: Credit Note, alokasi ke invoice dan debit note, saldo deposit (R8) | Selesai (2026-11-24) |
| D | Refund lewat Payment Request dan kasir (R9) | Selesai (2026-11-24) |
| E | Penggunaan saldo Credit Note Deposit di invoice berikutnya (P8) | Selesai (2026-11-24) |
| G | Report Credit Note: saldo per customer, daftar, detail, mutasi (R13). Bisa dikerjakan setelah C; pemakaian deposit ikut muncul setelah E | Selesai (2026-11-24) |
| F | Dokumen frontend dan test | Selesai (2026-11-24): [invoice-cancellation-paid-frontend.md](invoice-cancellation-paid-frontend.md); test di setiap fase |

Fase A dan B sebaiknya di-deploy bersamaan, karena tanpa B pengajuan berhenti di AR & AP.

## Pertanyaan

Default dipakai kalau tidak dijawab lain. **2026-11-24: semua default disetujui, kecuali P5 yang dijawab.** Usulan perubahan keputusan 45 (lihat catatan di bawah) juga disetujui dan sudah dikerjakan.

| No | Pertanyaan | Default |
| --- | --- | --- |
| P1 | Aturan "klien bayar minimal 50% dulu" (Tahap 5) juga berlaku di alur ini, termasuk invoice yang FP-nya sudah terbit tapi belum dibayar? | Ya (R1). Invoice FP terbit tanpa pembayaran baru bisa dibatalkan setelah 50% dibayar |
| P2 | Batas dana yang dikembalikan/dialihkan = pembayaran diterima − 50% × total invoice? (PDF: "50% dari nominal INV", tafsiran untuk invoice yang lunas penuh) | Ya (R3) |
| P3 | Ketentuan 2 (sudah diproses, sertifikat belum terbit): "tidak perlu dilanjut penagihan pelunasan". Perlu aksi khusus untuk menutup sisa tagihan tanpa dibayar? | Tidak di rancangan ini; pengajuan ditolak 409. Fitur tutup tagihan menyusul kalau dibutuhkan |
| P4 | Ketentuan 1–3 dipilih Sales lalu diperiksa AR & AP (sistem belum mencatat proses jasa/sertifikat)? | Ya (R2) |
| P5 | ~~Apakah aturan 50% juga berlaku untuk dana debit note (biasanya biaya pemerintah/reimburse)?~~ | **Dijawab 2026-11-24:** debit note tetap penuh (tidak dipotong 50%). Aksinya seperti Tahap 5: Sales memilih debit note dilanjutkan atau dibatalkan (R3, R4) |
| P6 | Debit note belum punya pembayaran sebagian. Pengalihan ke debit note tujuan harus melunasi debit note itu penuh? | Ya. Nominal ke debit note tujuan harus sama dengan totalnya; pembayaran sebagian debit note menyusul kalau dibutuhkan |
| P7 | Tolak oleh SPV, Wakil Direktur, atau Direktur kembali satu tahap (bukan langsung ke Sales)? | Ya, sesuai PDF 4.2 "tahap sebelumnya". Hanya tolak AR & AP yang kembali ke Sales |
| P8 | Saldo Credit Note Deposit dipakai di invoice berikutnya dengan cara apa? | Dicatat sebagai pembayaran diterima dari Credit Note di invoice baru customer yang sama (total invoice dan pajaknya tidak berubah), oleh AR & AP. Dikerjakan di Fase E setelah dikonfirmasi |
| P9 | Format nomor Credit Note? | `001/CN/{initial company}/{bulan romawi}/{tahun}`, urutan per company per tahun, seperti nomor invoice |
| P10 | Template Surat Pengajuan Refund disediakan siapa, dan diunduh dari mana? | Tim FAT memberi file template; disimpan di backend dan diunduh lewat endpoint statis |
| P11 | Refund dibuat satu Payment Request langsung ke kasir (`approve cashier`) tanpa approval Payment Request lagi? | Ya (R9) |
| P12 | Bukti potong PPh (bukti potong yang sudah diterima atau masih ditunggu) saat invoice dibatalkan? | Tidak diubah; invoice `cancelled` dengan riwayat bukti potong tetap. Penanganan pajaknya di luar sistem |
| P13 | Status FP saat invoice batal: nilai baru `cancelled` di `tax_invoice_status` (pembatalan di e-Faktur tetap dilakukan AR & AP di luar sistem)? | Ya (R7) |
| P14 | Dokumen PDF menulis status "AR & AP Review", "SPV FAT Internal Review", dan seterusnya. Cukup sebagai label "sedang diperiksa", bukan status tersendiri? | Ya (R6) |
| P15 | Credit Note terikat ke customer. Apakah juga harus company dan mata uang yang sama dengan dokumen asal? (Credit Note diterbitkan company tertentu; IDR dan RMB tidak bisa dicampur) | Ya: customer + company + mata uang sama |
| P16 | Aturan "INV to INV, DN to DN" juga berlaku untuk saldo deposit (deposit dari debit note hanya untuk debit note)? | Ya |
| P17 | Saldo deposit punya masa berlaku, atau berlaku sampai habis? | Berlaku sampai habis |
| P18 | Report Credit Note: export Excel dikerjakan frontend dari JSON (seperti report invoice), atau backend menyediakan file Excel? | Frontend, seperti report invoice |
| P19 | Siapa yang boleh membuka report Credit Note? | Semua user yang login, akses menu diatur lewat menu/posisi seperti report lain. Catatan: `/api/report-invoices` saat ini tidak memakai `authenticate`, perlu ditambahkan |
| P20 | Mutasi per customer perlu juga dalam bentuk PDF/surat untuk dikirim ke customer? | Tidak, hanya report internal |
| P21 | (Dibuka 2026-11-24, **belum dibahas**) Credit Note dipakai saat membuat invoice? Saat ini deposit baru bisa dipakai setelah SPV approve (`waiting for payment`). Opsi A: AR & AP memilih Credit Note di form create, otomatis dicatat sebagai pembayaran saat SPV approve; total dan pajak tetap, dokumen bisa menampilkan "Dikurangi Credit Note". Opsi B: `sub_total` dipotong sebelum pajak (DPP/PPN/FP dari nilai bersih, tidak cocok lagi dengan termin CT/PO; perlu persetujuan tim FAT/pajak) | **Jawaban klien 2026-11-24:** "Pajaknya terhitung dari nilai invoice/DN sebelum dipotong credit note" → **opsi A** (sama dengan cara kerja sekarang: Credit Note = pembayaran, total dan pajak tetap). Opsi B gugur. Diputuskan 2026-11-24: cara sekarang sudah cukup (deposit dipakai setelah SPV approve). Pemilihan Credit Note sejak invoice dibuat bisa dibahas lagi nanti |

## Catatan dari pengecekan alur invoice approval (2026-11-24)

Dibandingkan dengan "Kebutuhan Sistem - FAT Internal (4)":

- Poin 1–4.3 dan 6–6.3 sudah sesuai tracking di [invoice-approval-fat.md](invoice-approval-fat.md). Yang masih terbuka tetap sama: blokir approve saat CT/PO batal (2d), syarat addendum CT/PO (poin 5, keputusan 38), dan semua report.
- Dokumen (4) merinci hal yang belum ada di tabel progres: jenis Credit Note di 2.1 (non deposit = pengalihan piutang, deposit = hutang jasa), syarat refund di 2.2 (Surat Pengajuan Refund dan Nota Retur FP), dan rincian 7A.1. Semuanya tercakup di rancangan ini.
- Invoice dengan bukti bayar yang **semuanya ditolak** tidak bisa dibatalkan lewat Tahap 5 (keputusan 45 menolak kalau pernah ada bukti bayar di-upload, termasuk yang ditolak) maupun alur baru (belum ada pembayaran diterima). ~~Usulan: keputusan 45 hanya menghitung bukti bayar yang `verification` atau `accepted`. Perlu persetujuan karena mengubah Tahap 5.~~ Disetujui dan dikerjakan 2026-11-24: keputusan 45 hanya menghitung bukti bayar `verification` / `accepted`.
- Migrasi dan approval flow Tahap 5 ternyata **sudah ada** di DB1 dan DB2 (status `cancellation *`, tabel `invoice_cancellations`, flow `cancellation requested/reviewed/verified`), walaupun catatan deploy di invoice-approval-fat.md masih menulis "belum dijalankan".
- Master position belum punya Wakil Direktur dan Kasir. Kasir sudah dipakai di flow Payment Request `approve cashier`, posisinya sementara Developer.
- (2026-11-24, uji di DB) 3 dari 13 invoice `paid & clear` adalah data lama tanpa baris pembayaran diterima (`invoice_payments`), jadi pembayaran diterimanya 0 dan tidak bisa dibatalkan lewat alur ini (syarat 50%). Kalau salah satunya perlu dibatalkan, pembayarannya harus dicatat dulu.

## Implementasi fase A–B

Dikerjakan 2026-11-24. Kode: `src/services/invoice/invoicePaidCancellation.service.js`, model `invoicePaidCancellation.model.js`, route `/api/invoice-paid-cancellations`. Test: `tests/invoicePaidCancellation.test.js`.

### Endpoint

| Endpoint | Pelaku | Isi |
| --- | --- | --- |
| `GET /api/invoices/:id/paid-cancellation/preview` | Sales | `is_eligible`, `reasons`, `invoice_total`, `invoice_paid`, `invoice_kept`, `invoice_max_amount`, `tax_invoice_status`, `needs_tax_invoice_confirmation`, `debit_note` (`amount_if_cancelled`, `can_be_cancelled`), `transfer_targets` (`invoices`, `debit_notes`, masing-masing dengan `remaining`) |
| `PATCH /api/invoices/paid-cancellation-request/:id` | Sales (flow invoice `waiting for payment`) | Body R5. `invoice_amount` boleh tidak dikirim: default batas maksimal. `debit_note_amount` tidak dikirim, dihitung backend |
| `GET /api/invoice-paid-cancellations` | Semua | Filter `status` (boleh dipisah koma), `id_invoice`, `id_customer`, `id_company`, `search` (nomor invoice), `page` + `limit`. Membawa `is_can_approve_reject` dan `action_label` |
| `GET /api/invoice-paid-cancellations/:id` | Semua | Detail + file + `progress` (riwayat pengajuan ini) |
| `PUT /api/invoice-paid-cancellations/resubmit/:id` | Sales, dari `rejected` | Body lengkap seperti pengajuan baru; file diganti |
| `PATCH /api/invoice-paid-cancellations/withdraw/:id` | Sales, dari `rejected` | `note` opsional. Invoice kembali ke status sebelumnya |
| `PATCH /api/invoice-paid-cancellations/approve/:id` | AR & AP, SPV FAT Internal, Wakil Direktur, Direktur | `note` opsional |
| `PATCH /api/invoice-paid-cancellations/reject/:id` | Sama | `note` wajib, `reject_attachment` (array file) opsional |
| `PATCH /api/invoice-paid-cancellations/hold/:id` | AR & AP, dari `waiting ar&ap review` | `note` wajib: outstanding yang harus dilunasi dulu |

`GET /api/invoices/:id` memuat `paid_cancellations`.

### Yang ikut berubah

- Invoice: status baru `paid cancellation in progress` (semua aksi invoice lain ditolak, termasuk upload FP/Final Invoice). `tax_invoice_status` punya nilai baru `cancelled`.
- Riwayat invoice: status `paid cancellation requested` / `resubmitted` / `approved` / `held` / `rejected` / `withdrawn` / `completed`. Lampiran tolak menempel di entri `paid cancellation rejected` (`paid_cancellation_reject_attachment`).
- My Task: target `invoice paid cancellation`. Tugas upload FP (`invoice tax invoice`) tidak muncul untuk invoice yang sedang dibatalkan.
- Debit note yang ikut dibatalkan tidak bisa dicatat bayar selama pengajuan berjalan.
- Tahap 5: keputusan 45 diubah (bukti bayar yang ditolak tidak menghalangi).
- ~~Belum dikerjakan: pemrosesan `waiting for payment transfer` (fase C) dan `waiting for refund process` (fase D).~~ Keduanya selesai (fase C dan D). Pengajuan yang sudah di-approve Direktur dengan dana yang dikembalikan menunggu di status itu. Template Surat Pengajuan Refund (P10) menunggu file dari tim FAT.

### Deploy

~~**Belum dijalankan** di database:~~ Langkah 1 dan 2 **sudah dijalankan** di DB1 dan DB2 pada 2026-11-24 (flow `invoice paid cancellation` id 50–57, posisi Developer). Langkah 3 menunggu admin.

1. `npm run db:sync-invoice-payments` (langkah 9): status invoice `paid cancellation in progress`, `tax_invoice_status` `cancelled`, status riwayat baru, dan tabel `invoice_paid_cancellations`. **Wajib sebelum kode ini jalan**, karena detail invoice memuat tabel baru.
2. `npm run db:setup-approval-flows`: membuat flow `invoice paid cancellation` untuk 8 status (sementara posisi Developer).
3. Buat posisi **Wakil Direktur** (posisi global) di master position, lalu atur posisi tiap flow lewat `/api/approval-flows`: `waiting ar&ap review`, `waiting outstanding settlement`, `waiting for payment transfer`, `waiting for refund process` → AR & AP; `rejected` → Sales; `waiting spv fat internal approval` → SPV FAT Internal; `waiting vice director approval` → Wakil Direktur; `waiting director approval` → Direktur.

## Implementasi fase C (pengalihan pembayaran dan Credit Note)

Dikerjakan 2026-11-24. Kode: `processTransfer` di `invoicePaidCancellation.service.js`, model `src/models/creditNote/`. Test di `tests/invoicePaidCancellation.test.js`.

### Endpoint

`PATCH /api/invoice-paid-cancellations/process-transfer/:id` (AR & AP, flow `waiting for payment transfer`):

| Field | Wajib | Isi |
| --- | --- | --- |
| `transfer_proof` | Ya | Bukti pengalihan pembayaran (7A.2), array file |
| `allocations` | Ya | `[{ type: invoice/debit_note, id, amount, payment_proof }]`. Boleh berbeda dari pilihan Sales (tujuan bisa sudah dibayar sejak diajukan); aturannya sama dengan `transfer_targets` (R5). `payment_proof` wajib per tujuan (7A.3). Array kosong: semua dana menjadi deposit |
| `transfer_date` | Tidak | Tanggal pembayaran di dokumen tujuan, default hari ini |
| `note` | Tidak | Catatan di Credit Note |

Yang terjadi dalam satu transaksi:

1. Satu Credit Note per dokumen asal yang punya dana: nomor `001/CN/{initial}/{bulan romawi}/{tahun}` (urutan per company per tahun), `amount` = dana pengajuan, `balance` = sisa setelah alokasi (deposit).
2. Invoice tujuan: baris `invoice_payments` baru berstatus `accepted`, `payment_method` `credit note`, `id_credit_note`, dengan bukti dari AR & AP. Efeknya sama dengan `payment-accept`: lunas → bukti potong / `paid & clear`, dan Final Invoice/FP diminta otomatis kalau belum.
3. Debit note tujuan: `paid` penuh (`payment_amount`, `payment_date`, `proof_of_payment` = url file pertama), plus Payment Request asalnya ikut `paid` seperti pembayaran debit note biasa.
4. Setiap tujuan dicatat di `credit_note_allocations` (`type` `transfer`) dengan bukti bayarnya.
5. Pengajuan `completed`; invoice asal `cancelled`, FP `cancelled`, debit note asal `cancelled` kalau dipilih. Riwayat invoice mencatat nomor Credit Note, nominal, dan deposit.

`GET /api/invoice-paid-cancellations/:id` memuat `credit_notes` beserta `allocations` dan `transfer_proof`. `GET /api/invoices/:id` memuat `credit_note` di setiap pembayaran yang berasal dari Credit Note.

### Deploy fase C

~~**Belum dijalankan** di database:~~ **Sudah dijalankan** di DB1 dan DB2 pada 2026-11-24:

1. `npm run db:sync-invoice-payments` (langkah 10): tabel `credit_notes` dan `credit_note_allocations`, metode `credit note` di `invoice_payments.payment_method`, kolom `invoice_payments.id_credit_note`. **Wajib sebelum kode ini jalan**, karena detail invoice memuat kolom baru.

## Implementasi fase D (refund lewat Payment Request)

Dikerjakan 2026-11-24. Kode: `createRefund` dan `onRefundPaymentRequest` di `invoicePaidCancellation.service.js`, hook `_settleRefund` di `paymentRequest.service.js`. Test di `tests/invoicePaidCancellation.test.js`.

### Alur

1. **AR & AP**: `PATCH /api/invoice-paid-cancellations/create-refund/:id` (flow `waiting for refund process`). Body opsional: `refund_bank_name`, `refund_account_name`, `refund_account_number` (default data dari Sales, boleh dikoreksi), `priority` (`normal` default / `urgent`), `note`. Sistem membuat Payment Request:
   - `payment_type` `refund`, `id_invoice_paid_cancellation`, nomor `PRQ-{initial}-{tahun}-{00001}` (sama dengan `GET /payment-requests/no/documents`);
   - nominal = dana invoice + dana debit note, company dan customer dari invoice, department dari user AR & AP, rekening klien, keterangan menyebut nomor invoice/debit note;
   - **langsung berstatus `approve cashier`** (menunggu kasir input pembayaran), tanpa approval dept manager s.d. direktur, karena pembatalannya sudah di-approve sampai Direktur. Riwayat Payment Request dicatat `requested`.
   - Pengajuan menjadi `waiting for cashier payment` dengan `id_payment_request`; riwayat invoice `paid cancellation refund requested`.
2. **Kasir**: endpoint Payment Request yang sudah ada, `PATCH /api/payment-requests/paid/:id`, dengan bukti bayar refund (7B.3–7B.4). Dalam transaksi yang sama, pengajuan `completed`, invoice `cancelled` (dan FP serta debit note kalau dipilih) (7B.5–7B.6).
3. **Kalau kasir menolak** (`PATCH /api/payment-requests/reject/:id`), pengajuan kembali ke `waiting for refund process` dengan catatan penolakan, dan AR & AP membuat Payment Request baru (misalnya dengan rekening yang dikoreksi). Payment Request yang ditolak tetap tersimpan dan tidak bisa menyelesaikan pengajuan lagi.

Payment Request refund **tidak bisa diedit, dihapus, atau di-approve** (409); hanya dibayar atau ditolak kasir. `GET /api/invoice-paid-cancellations/:id` memuat `payment_request` (yang sedang berjalan) dan `refund_payment_requests` (semua, termasuk yang ditolak).

### Ikut diperbaiki

- `payment_requests.total_payment_request` dan `total_payment` dilebarkan dari `DECIMAL(10,2)` (maksimal 99.999.999,99) menjadi `DECIMAL(20,2)`, karena refund invoice di atas 200 juta melewati 100 juta. Berlaku untuk semua Payment Request.
- Bug lama di `paymentRequest.service.js`: menandai `paid` Payment Request yang terhubung ke biaya project plan kontrak menulis ke `models.dbb` (typo `db2`), sehingga gagal di mode dua database. Sudah diperbaiki.
- Error 409/404 dari Payment Request sekarang dikembalikan dengan status code-nya (sebelumnya selalu 500).

### Deploy fase D

~~**Belum dijalankan** di database:~~ **Sudah dijalankan** di DB1 dan DB2 pada 2026-11-24:

1. `npm run db:sync-invoice-payments` (langkah 11): `payment_type` `refund`, kolom `payment_requests.id_invoice_paid_cancellation` dan `invoice_paid_cancellations.id_payment_request`, status riwayat `paid cancellation refund requested`, dan pelebaran dua kolom nominal Payment Request. **Wajib sebelum kode ini jalan**, karena setiap perubahan status Payment Request membaca kolom baru.

## Implementasi fase E (pemakaian saldo deposit)

Dikerjakan 2026-11-24, mengikuti P8, P15, dan P16. Kode: `src/services/creditNote/creditNote.service.js`. Logika "bayar dari Credit Note" dipindah ke service ini dan dipakai bersama oleh pengalihan (7A, alokasi `transfer`) dan pemakaian deposit (alokasi `deposit`). Tidak ada migrasi baru.

| Endpoint | Pelaku | Isi |
| --- | --- | --- |
| `GET /api/credit-notes/deposits?target_type=invoice&id_target=5` | AR & AP | Credit Note yang boleh membayar dokumen itu: customer, company, dan mata uang sama (P15), asal sejenis (P16: deposit dari invoice hanya untuk invoice, dari debit note hanya untuk debit note), saldo > 0, terlama dulu. Membawa `remaining` dokumen dan `must_pay_in_full` (debit note) |
| `PATCH /api/invoices/credit-note-payment/:id` | AR & AP (flow invoice `payment verification`) | Bayar invoice `waiting for payment` / `payment proof rejected` dari deposit |
| `PATCH /api/debit-notes/credit-note-payment/:id` | Flow debit note `approved` (sama dengan pencatatan bayar debit note) | Bayar debit note `approved` penuh dari deposit |
| `GET /api/credit-notes/:id` | Semua | Credit Note: asal (invoice/debit note, pengajuan pembatalan) dan semua pemakaiannya |

Body kedua `PATCH`: `id_credit_note` (wajib), `amount` (wajib, ≤ saldo dan ≤ sisa tagihan; debit note harus sama dengan totalnya), `payment_date` (default hari ini), `payment_proof` (array file, opsional), `note`.

Hasilnya sama seperti pengalihan: pembayaran `accepted` bermetode `credit note` di invoice (lunas → bukti potong / `paid & clear`, Final Invoice/FP diminta otomatis), atau debit note `paid` (Payment Request asalnya ikut `paid`). Pemakaian dicatat di `credit_note_allocations` dengan `type` `deposit`, dan `credit_notes.balance` berkurang. Total dan pajak invoice tidak berubah.

## Implementasi fase G (report Credit Note)

Dikerjakan 2026-11-24 sesuai R13. Kode: `src/services/report/reportCreditNote.service.js`, route `/api/report-credit-notes` (wajib login). Test: `tests/reportCreditNote.test.js`. Tidak ada migrasi.

Semua tanggal dikirim sebagai `YYYY-MM-DD` dan dibaca dengan zona waktu server (`as_of` dan `date_to` sampai akhir hari). Saldo dihitung dari alokasi sampai tanggal itu, bukan dari kolom `credit_notes.balance`. Tanggal Credit Note = saat AR & AP memproses pengalihan; tanggal alokasi = `transfer_date` / `payment_date` yang diisi AR & AP.

| Endpoint | Isi | Filter |
| --- | --- | --- |
| `GET /api/report-credit-notes/balances` | Per customer + company + mata uang + asal: `credit_note_count`, `issued`, `used_transfer`, `used_deposit`, `used`, `balance`, `last_activity`. Plus `totals` per mata uang dan `as_of` | `id_customer`, `id_company`, `currency_type`, `source_type`, `search` (nama/kode customer), `as_of`, `has_balance` (default `true`; `false` ikut menampilkan yang saldo 0), `page` + `limit` |
| `GET /api/report-credit-notes` | Per Credit Note, terbaru dulu: nomor, tanggal, customer, company, mata uang, `source` (nomor invoice/debit note, total, `contract_no` / `pre_order_no`), `settlement`, `amount`, `used_transfer`, `used_deposit`, `balance`, `status` (`open` / `used up`) | `id_customer`, `id_company`, `currency_type`, `source_type`, `status`, `date_from` / `date_to` (tanggal Credit Note), `search` (nomor Credit Note / invoice / debit note, nama/kode customer), `page` + `limit` |
| `GET /api/report-credit-notes/:id` | **Dari mana**: `source` + `source.cancellation` (alasan, ketentuan, penyelesaian, total/dibayar/50% ditahan/dana, tanggal approve Direktur). **Dipakai untuk apa**: `allocations` berurutan tanggal (`type`, `target` dengan nomor dan CT/PO, `amount`, saldo berjalan `balance`, `note`, `user`, `payment_proof`) | - |
| `GET /api/report-credit-notes/ledger` | Mutasi satu customer, dipisah per company + mata uang + asal: `opening_balance` pada `date_from`, `entries` (`kind`: `issued` / `transferred` / `used as deposit`, `document`, `amount_in`, `amount_out`, `balance`), `closing_balance`. Di hari yang sama, penerbitan muncul sebelum pemakaiannya | `id_customer` (wajib), `date_from` (kosong = dari awal), `date_to` (default hari ini), `id_company`, `currency_type`, `source_type` |

Response list dan saldo memakai format pagination yang sama dengan report invoice (`data` + `pagination`) kalau `page` dan `limit` dikirim.
