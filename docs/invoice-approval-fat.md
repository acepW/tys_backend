# Invoice: Progres Alur Approval FAT Internal

Dokumen ini mencatat progres implementasi alur invoice berdasarkan dokumen kebutuhan **"Kebutuhan Sistem - FAT Internal"**: poin mana yang sudah dikerjakan, mana yang belum, keputusan yang dipakai, dan pertanyaan yang masih terbuka.

Penomoran poin mengikuti dokumen kebutuhan. Perbarui kolom **Status** setiap kali satu poin selesai dikerjakan.

## Perubahan dokumen kebutuhan

| Tanggal    | Poin  | Perubahan (tanda hijau di dokumen klien)                                                                                                         | Dampak                                                                    |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 2026-11-04 | 2     | Kondisi REJECT oleh SPV FAT: (1) salah PPh/PPN → `REJECTED`, kembali ke My Task AR & AP untuk revisi pajak; (2) CT/PO di-addendum/batal/revisi → status CT/PO CANCELLED, SPV tidak bisa approve dan wajib REJECT, Sales membuat invoice dari awal | Menjawab pertanyaan Tahap 4 no. 2. Reject dipecah menjadi dua jenis       |
| 2026-11-04 | 3.1.1 | AR & AP **menerbitkan dan upload Final Invoice** bersama Faktur Pajak. Status menjadi "Final Invoice & Tax Invoice (FP) Issued"                  | Menjawab pertanyaan Tahap 4 no. 3. Proforma menjadi Final di langkah ini |
| 2026-11-18 | 3.3.1 | Revisi tax ternyata juga boleh mengubah **PPN**, bukan hanya PPh. Semua pajak bisa diisi saat revisi                                          | Keputusan 15 diubah, ditambah keputusan 49–52. FP bisa batal kalau PPN dihapus |
| 2026-11-24 | Cancel sudah bayar 2.1, 2.2, 7A.1 | Dokumen "(4)": jenis Credit Note (non deposit = pengalihan piutang, deposit = hutang jasa), syarat refund (Surat Pengajuan Refund sesuai template, Nota Retur FP kalau FP sudah dikreditkan), rincian pembukaan Credit Note | Dirancang di [invoice-cancellation-paid.md](invoice-cancellation-paid.md), menunggu persetujuan |
| 2026-11-18 | 6     | Jawaban pertanyaan Tahap 5: proforma yang belum dibayar wajib dibayar 50% dulu sebelum di-cancel; konversi (B) juga perlu persetujuan Direktur; konversi membuat invoice baru dengan nomor lanjutan; bukti wajib juga di konversi (B). Saat pembatalan, Sales memilih apakah debit note ikut dibatalkan | Pertanyaan Tahap 5 no. 1–4 terjawab. Keputusan 40 dan 43 terkonfirmasi, keputusan 47 berubah menjadi pilihan. Usulan lanjutan di Pertanyaan terbuka Tahap 5 |

| Status          | Arti                                                         |
| --------------- | ------------------------------------------------------------ |
| Sudah ada       | Sudah berjalan di sistem sebelum pekerjaan ini dimulai       |
| Perlu penyesuaian | Sudah ada, tetapi belum sama persis dengan dokumen          |
| Belum           | Belum dikerjakan, masuk rencana tahap tertentu               |
| Selesai         | Sudah dikerjakan sesuai dokumen                              |
| Ditunda         | Belum masuk rencana, menunggu keputusan atau prioritas       |

## Pembagian tahap

| Tahap | Isi                                                                                   | Kondisi                     |
| ----- | ------------------------------------------------------------------------------------- | --------------------------- |
| 0     | Perbaikan bug urutan argumen `PATCH /invoices/waiting-for-payment/:id`                | Selesai (2026-10-29)        |
| 1     | Sales upload bukti bayar, AR&AP verifikasi (terima/tolak), bayar sebagian             | Selesai (2026-10-29)        |
| 2     | Request Faktur Pajak (FP) dan Revision Request                                        | Selesai (2026-10-29)        |
| 3     | Bukti potong PPh (Withholding Tax), status `paid & clear`                             | Selesai (2026-11-04)        |
| 4     | Bagian awal alur: hapus signing, dua jenis reject SPV (pajak / CT/PO), Final Invoice  | Selesai (hapus signing 2026-10-29; reject dan Final Invoice 2026-11-04), kecuali blokir approve CT/PO (2d, menunggu alur pembatalan) |
| 5     | Cancel dan konversi Proforma Invoice (poin 6–6.3)                                     | Selesai (2026-11-18), kecuali poin 5 (syarat addendum/pembatalan CT/PO, keputusan 38) |
| 6     | Cancel invoice yang sudah bayar / terbit FP                                           | Selesai 2026-11-24 (fase A–G). Rancangan: [invoice-cancellation-paid.md](invoice-cancellation-paid.md); frontend: [invoice-cancellation-paid-frontend.md](invoice-cancellation-paid-frontend.md). Menunggu: posisi Wakil Direktur, template surat refund |
| -     | ~~Alur pembatalan invoice dan~~ seluruh report                                        | Ditunda                     |

## Alur saat ini (setelah Tahap 1–2 dan hapus signing)

Tahap 2 menambahkan Faktur Pajak (kolom `tax_invoice_status`, berjalan berdampingan dengan status di bawah) dan alur revisi dari `waiting for payment`. Diagram lengkapnya ada di [invoice-frontend.md](invoice-frontend.md).

```text
incoming invoice ─► pending ─submit─► on verification ─approve──────────────► waiting for payment ◄──────────┐
                                             └─reject─► rejected (berhenti)               │ Sales upload    │ belum lunas
                                                                                          ▼ bukti bayar     │
                                                        payment proof rejected ◄─tolak─ payment verification ─terima─┤
                                                           (Sales upload ulang)                              │ lunas
                                                                                                             ▼
                                                                                    paid ─► upload FP (tanpa status)
```

Sebelum perubahan ini: `approve` → `approved` → `signing` → upload `file_invoice` → `waiting for payment` → `pay` (AR&AP input data bayar) → `paid`.

## Alur target setelah Tahap 1–3

```
... ─► waiting for payment ─┬─ Request FP ─► (tax_invoice_status: requested ─► issued)
              ▲             ├─ Revision Request ─► revision requested ─► waiting for revision ─┐
              │             │        (AR&AP tolak ─► waiting for payment)  (SPV tolak ─► revision requested)
              ├─────────────┼──────────────────────────────────────────────────────────────────┘ SPV approve
              │             └─ Upload bukti bayar ─► payment verification
              │                                        ├─ tolak ─► payment proof rejected ─► (upload ulang)
              └──────────── belum lunas ◄──────────────┤
                                                       └─ lunas ─┬─ ada PPh ─► paid waiting wht ─► wht verification ─► paid & clear
                                                                 │                         (tolak ─► wht rejected ─► upload ulang)
                                                                 └─ tanpa PPh ─► paid & clear
```

Tambahan Tahap 4 dari perubahan dokumen 2026-11-04 (usulan no. 2a–2h):

```text
on verification ─┬─ approve (tanpa file) ─► waiting for payment ...
                 ├─ reject (tax) ─► rejected ─AR&AP edit + submit─► on verification
                 └─ reject (ct/po cancelled) ─► cancelled (berhenti; Sales buat invoice dari awal)

FP / Final Invoice: tax_invoice_status requested ─AR&AP upload FP + file_final_invoice─► issued (is_final = true)
                    invoice tanpa PPN: setelah bukti bayar pertama diterima ─AR&AP upload file_final_invoice─► is_final = true
```

## Progres per poin: Tahapan Approval/Verifikasi Invoice

| Poin  | Ringkasan dokumen                                                                    | Status dokumen                          | Tahap | Status            | Catatan                                                                                                   |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------- | ----- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| 1     | AR&AP buat draft dari request Sales (hal. 1 cek tax, hal. 2 cek debit note), DONE     | Pending                                 | 4     | Perlu penyesuaian | Sudah ada lewat `POST /invoices/from-incoming` → `pending` → `submit`. Wizard 2 halaman diurus frontend. |
| 2     | SPV FAT Internal approve draft, masuk AR Report                                       | Approved by SPV FAT Internal / Manager  | 4     | Selesai           | `PATCH /invoices/approve/:id` tanpa upload file (sejak 2026-11-04; sebelumnya sekaligus upload `file_invoice`), invoice langsung `waiting for payment`. Signing dihapus. |
| 2 (reject 1) | Salah PPh/PPN → REJECTED, kembali ke My Task AR & AP untuk revisi pajak        | Rejected                                | 4     | Selesai           | `PATCH /invoices/reject/:id` dengan `reject_type: tax` → `rejected`. AR & AP edit (`PUT`) dan submit ulang. Flow `invoice` / `rejected` (AR & AP). |
| 2 (reject 2) | CT/PO di-addendum/batal/revisi → SPV tidak bisa approve, wajib REJECT, Sales buat invoice dari awal | Rejected                | 4     | Perlu penyesuaian | `reject_type: ct/po cancelled` → `cancelled` (status akhir): selesai. Blokir approve saat CT/PO CANCELLED menunggu alur pembatalan CT/PO (2d). |
| 3     | Sales buka/download invoice yang sudah di-approve, ada 4 pilihan aksi                 | Waiting For Payment                     | 1–2   | Perlu penyesuaian | Pilihan 1–3 selesai (lihat baris di bawah). Pilihan 4 (cancellation request) ditunda bersama alur pembatalan. |
| 3 (1) | Request Tax Invoice (FP), hanya 1x                                                    | -                                       | 2     | Selesai           | Lihat 3.1.                                                                                                |
| 3 (2) | Upload Payment Proof. Bayar sebagian/penuh → Proforma jadi Final, AR&AP wajib buat FP | -                                       | 1, 2, 4 | Selesai           | Bukti bayar pertama yang diterima meminta Final Invoice (+ FP untuk invoice ber-PPN) ke AR & AP; Proforma menjadi Final saat AR & AP upload di 3.1.1. |
| 3 (3) | Revision Request (perubahan tax, wajib bukti chat klien), nomor invoice & FP tetap    | -                                       | 2     | Selesai           | Lihat 3.3. Sejak 2026-11-18 FP bisa batal kalau PPN dihapus saat revisi (keputusan 51); nomor invoice tetap. |
| 3 (4) | Invoice cancellation request                                                          | -                                       | 5     | Perlu penyesuaian | Untuk invoice yang belum bayar dan belum request FP: selesai (poin 6). Invoice yang sudah bayar / terbit FP masih ditunda. |
| 3.1   | Request FP masuk ke My Task AR&AP                                                     | Tax Invoice (FP) Requested              | 2     | Selesai           | `PATCH /invoices/tax-invoice-request/:id`. Disimpan di `tax_invoice_status`, My Task target `invoice tax invoice`. |
| 3.1.1 | AR&AP **terbitkan dan upload Final Invoice**, buat dan upload FP, masuk ke Outcome Tax Invoice Report | Final Invoice & Tax Invoice (FP) Issued | 2, 4 | Selesai | `PATCH /invoices/tax-invoice/:id` (hanya saat `requested`): wajib `file_final_invoice`, plus nomor/tanggal/file FP untuk invoice ber-PPN. Invoice menjadi Final (`is_final`, `final_at`). Report-nya sendiri ditunda. |
| 3.1.2 | Sales download FP, menunggu pembayaran                                                | Waiting For Payment                     | 2     | Selesai           | Hanya pemberitahuan ke Sales (`tax_invoice_status = issued`), bukan tugas My Task.                        |
| 3.1.3 (3.2) | Sales upload bukti bayar + nominal, tanggal transfer, bank penerima             | Payment Verification                    | 1     | Selesai           | `PATCH /invoices/upload-payment/:id`. Endpoint lama `pay` dihapus.                                        |
| 3.3   | Revision Request masuk ke My Task AR&AP                                               | Invoice Revision Requested              | 2     | Selesai           | `PATCH /invoices/revision-request/:id`, bukti chat di riwayat. AR&AP bisa menolak (`/revision-request-reject/:id`). |
| 3.3.1 | AR&AP edit tax, masuk ke My Task SPV                                                  | Waiting For Revision                    | 2     | Selesai           | `PATCH /invoices/revise/:id`, ~~hanya PPh~~ PPN dan PPh (sejak 2026-11-18, keputusan 49–52). `PUT /invoices/:id` sekarang hanya untuk `pending`.              |
| 3.3.2 | SPV approve hasil revisi                                                              | Approved by SPV FAT Internal            | 2     | Selesai           | `PATCH /invoices/revision-approve/:id` (tanpa upload file sejak 2026-11-04) / `/revision-reject/:id`.          |
| 3.3.3 | Sales buka invoice hasil revisi                                                       | Waiting For Payment                     | 2     | Selesai           |                                                                                                           |
| 4     | AR&AP cek bukti bayar sesuai invoice                                                  | -                                       | 1     | Selesai           | `PATCH /invoices/payment-accept/:id`, `/payment-reject/:id`                                               |
| 4.1   | Sesuai + ada PPh → Sales menagih bukti potong, masuk Outstanding Withholding Tax List | PAID, Waiting for Withholding Tax Receipt | 3   | Selesai           | `payment-accept` yang melunasi invoice ber-PPh 23 / PPh 4(2) membuat baris `withholding_taxes` dan status `paid waiting wht`. List-nya sendiri report (ditunda). |
| 4.1.1 | Sales upload bukti potong                                                             | Withholding Tax Verification            | 3     | Selesai           | `PATCH /invoices/:id/withholding-taxes/:whtId/upload`, per jenis PPh.                                     |
| 4.1.2 | AR&AP cek checklist 10 item, isi nomor, masa pajak, tanggal bukti potong              | PAID & CLEAR                            | 3     | Selesai           | `PATCH /invoices/:id/withholding-taxes/:whtId/accept`, semua item checklist wajib. Data untuk Withholding Tax (PPh 23) List (report, ditunda). |
| 4.1.3 | AR&AP reject bukti potong + screenshot + komentar                                     | Withholding Tax Receipt Rejected        | 3     | Selesai           | `PATCH /invoices/:id/withholding-taxes/:whtId/reject`, screenshot di riwayat `wht rejected`.              |
| 4.1.4 | Sales upload ulang bukti potong sampai sesuai                                         | Withholding Tax Verification            | 3     | Selesai           | Endpoint upload yang sama; file lama diganti.                                                              |
| 4.2   | Sesuai + tanpa PPh, masuk Account Receivable List                                     | PAID & CLEAR                            | 1, 3  | Selesai           | Lunas tanpa PPh 23 / PPh 4(2) langsung `paid & clear`. Status `paid` dihapus. List-nya sendiri report (ditunda). |
| 4.3   | Tidak sesuai, AR&AP beri komentar, masuk ke My Task Sales                             | Payment Proof Rejected                  | 1     | Selesai           | Komentar wajib, disimpan di `invoice_payments.verification_note`.                                         |
| 4.3.1 | Sales upload ulang bukti bayar                                                        | Payment Verification                    | 1     | Selesai           | Bukti yang ditolak tetap tersimpan sebagai riwayat; upload ulang membuat baris baru.                      |
| 5     | Cancellation request karena perubahan CT/PO (tombol aktif setelah addendum/pembatalan) | -                                      | -     | Ditunda           | Dilepas dulu (keputusan 38).                                                                                                           |
| 6     | Cancellation request untuk invoice yang belum bayar dan belum request FP              | Invoice cancellation Requested          | 5     | Selesai           | `PATCH /invoices/cancellation-request/:id` (`type` `cancel` / `convert`, alasan, bukti, pilihan debit note) → `cancellation requested`. Keputusan 38–48, U1–U16. |
| 6.1   | AR&AP approve pembatalan                                                              | Approved by AR & AP                     | 5     | Selesai           | `PATCH /invoices/cancellation-approve/:id` → `cancellation reviewed`; tolak lewat `/cancellation-reject/:id`. |
| 6.2   | SPV FAT Internal approve pembatalan                                                   | Approved by SPV FAT INT                 | 5     | Selesai           | Endpoint yang sama → `cancellation verified`. |
| 6.3   | Direktur approve pembatalan                                                           | Approved by Direktur                    | 5     | Selesai           | Endpoint yang sama → invoice `cancelled`; konversi membuat invoice baru 50% (`waiting for payment`); debit note ikut batal kalau dipilih. |

## Progres per poin: Tahapan Cancel Invoice yang Sudah Bayar / Terbit FP

Rancangan lengkap, fase, dan pertanyaannya: [invoice-cancellation-paid.md](invoice-cancellation-paid.md) (2026-11-24).

| Poin      | Ringkasan dokumen                                                           | Status    | Rancangan |
| --------- | --------------------------------------------------------------------------- | --------- | --------- |
| 1–1.2     | Sales ajukan pembatalan, ketentuan 1–3, pop up debit note dan FP, alasan + dokumen | Selesai   | R1–R5, fase A |
| 2–2.1     | Sales pilih penyelesaian (Pengalihan Pembayaran / Refund) dan nominal; Credit Note non deposit / deposit | Selesai   | Pilihan dan tujuan pengalihan: fase A. Pembukaan Credit Note: fase C. Pemakaian deposit di invoice berikutnya: fase E |
| 2.2       | Refund: Surat Pengajuan Refund (template) dan Nota Retur FP                  | Selesai   | R5, fase A (template-nya menunggu file dari tim FAT, P10) |
| 3–3.3     | Review AR&AP, termasuk cek outstanding invoice/debit note klien             | Selesai   | R6, fase B |
| 4–4.3     | Review SPV FAT Internal                                                     | Selesai   | R6, fase B |
| 5–5.3     | Review Wakil Direktur                                                       | Selesai   | R6, R10, fase B (posisi Wakil Direktur belum ada di master) |
| 6–6.3     | Review Direktur                                                             | Selesai   | R6, fase B |
| 7A–7A.5   | Alur Pengalihan Pembayaran (Credit Note, alokasi, deposit)                  | Selesai   | R8, fase C; pemakaian deposit di invoice berikutnya: fase E |
| 7B–7B.6   | Alur Refund lewat Payment Request dan Kasir                                 | Selesai   | R9, fase D |

## Progres per poin: Yang dibutuhkan FAT Internal pada Sistem (report)

Semua report ditunda. Data yang dibutuhkan report invoice penjualan (pembayaran, FP, bukti potong) disiapkan di Tahap 1–3.

| Report                                         | Sumber data                               | Status  |
| ---------------------------------------------- | ----------------------------------------- | ------- |
| Petty Cash Report                              | -                                         | Ditunda |
| AR Report                                      | Invoice penjualan                         | Ditunda |
| AR Aging Report (sudah / belum jatuh tempo)    | Invoice penjualan                         | Ditunda |
| AP Report                                      | Invoice pembelian vendor                  | Ditunda |
| AP Aging Report                                | Invoice pembelian vendor                  | Ditunda |
| Outstanding Withholding Tax List               | Invoice penjualan (Tahap 3)               | Ditunda |
| Customer Withholding Tax (PPh 23) List         | Invoice penjualan (Tahap 3)               | Ditunda |
| Vendor Withholding Tax (PPh 21 / PPh 23 / PPh 4(2) / PP 20) List | Invoice pembelian vendor | Ditunda |
| Outcome Tax Invoice Report (PPN Keluaran)      | Invoice penjualan (Tahap 2)               | Ditunda |
| Income Tax Invoice Report (PPN Masukan)        | Invoice pembelian                         | Ditunda |
| PPN Payment Report                             | PPN Keluaran − PPN Masukan                | Ditunda |
| Credit Note Report (tambahan, bukan dari PDF, diminta 2026-11-24): saldo per customer, daftar, detail, mutasi | Credit Note dari pembatalan invoice yang sudah bayar | Selesai 2026-11-24, `/api/report-credit-notes` (R13 dan fase G di [invoice-cancellation-paid.md](invoice-cancellation-paid.md)) |

## Keputusan yang dipakai (disepakati 2026-10-29)

### Tahap 1: Bukti bayar

1. Bayar sebagian diperbolehkan. Setiap bukti bayar yang diterima dijumlahkan. Kalau sudah ≥ `total` invoice, status jadi lunas. Kalau belum, kembali ke `waiting for payment`. `total` sudah dikurangi PPh (`sub_total + PPN − PPh 23 − PP 20 − PPh 4(2)`).
2. Nominal tidak boleh melebihi sisa tagihan.
3. Bukti bayar diverifikasi satu per satu. Sales tidak bisa upload bukti baru selama ada yang sedang diverifikasi.
4. Nama bank penerima diisi teks bebas.
5. `payment_method` (transfer/cash) tetap diisi, default `transfer`.
6. Tahap 1 hanya untuk pembayaran invoice. Debit note tetap memakai alurnya sendiri.
7. AR&AP hanya bisa terima atau tolak, tidak mengoreksi nominal.
8. Hak akses Sales mengikuti approval flow berbasis posisi, sama seperti fitur lain.
9. Endpoint `PATCH /invoices/pay/:id` dihapus, digantikan alur bukti bayar.
10. Data pembayaran invoice lama yang sudah `paid` dipindahkan ke tabel pembayaran sebagai satu pembayaran yang sudah diterima.

### Tahap 2: Faktur Pajak dan Revision Request

11. Invoice tanpa PPN (`tax_ppn = false`) tidak butuh FP.
12. Sales boleh request FP selama FP belum terbit dan invoice sudah di-approve SPV, termasuk saat bukti bayar sedang diverifikasi. Maksimal 1x.
13. FP terbit hanya menjadi pemberitahuan ke Sales, bukan tugas di My Task.
14. Setelah bukti bayar diterima dan FP belum terbit, FP otomatis menjadi tugas AR&AP (khusus invoice ber-PPN).
15. ~~Revision Request hanya mengubah PPh (PPh 23 / PP 20 / PPh 4(2)), bukan PPN, item jasa, atau nominal.~~ Diubah 2026-11-18: Revision Request mengubah semua pajak, yaitu PPN, PPh 23, PP 20, dan PPh 4(2). Item jasa dan nominal tetap tidak berubah. Lihat keputusan 49–52.
16. Revision Request hanya bisa diajukan kalau belum ada pembayaran yang diterima.
17. AR&AP boleh menolak Revision Request dengan komentar. Invoice kembali ke `waiting for payment`.
18. Kalau SPV menolak hasil revisi, invoice kembali ke AR&AP (`revision requested`).
19. Lampiran bukti chat klien wajib minimal 1 file, boleh lebih.

### Tahap 3: Bukti potong

20. Yang wajib bukti potong: PPh 23 dan PPh 4(2). PP 20 tidak.
21. Satu bukti potong per jenis PPh.
22. Bukti potong baru bisa di-upload setelah invoice lunas.
23. Checklist 10 item verifikasi disimpan ke database. *(Sejak 2026-11-18 setiap item `{ checked, note }`, lihat keputusan 55.)*
24. DPP, tarif, nilai PPh, dan dokumen referensi diambil dari invoice. AR&AP hanya mengisi nomor, masa pajak, dan tanggal bukti potong.
25. Format masa pajak: `MM-YYYY`.
26. Penolakan bukti potong wajib minimal 1 screenshot dan komentar.
27. Invoice lama yang sudah `paid` dipindahkan ke `paid & clear`.
28. AR & AP hanya bisa menerima bukti potong kalau semua 10 item checklist dicentang; selain itu ditolak. (2026-11-04)
29. Tarif bukti potong diambil dari master tax saat invoice lunas dan tidak ikut berubah kalau master diubah setelahnya. (2026-11-04)
30. Invoice dengan PPh 23 dan PPh 4(2) sekaligus butuh dua upload terpisah, masing-masing diverifikasi sendiri. (2026-11-04)
31. Invoice lama yang `paid` langsung `paid & clear` tanpa menagih bukti potong, walaupun punya PPh. (2026-11-04)

### Hasil pengecekan dengan dokumen "Kebutuhan Sistem - FAT Internal (2)" (2026-11-10)

32. Revisi PPh yang di-approve SPV setelah Final terbit membuat `tax_invoice_status` kembali `requested`. AR & AP wajib upload ulang Final Invoice karena totalnya berubah; `is_final` tetap `true` dan FP tetap berlaku. Ini keputusan tambahan, PDF hanya menyebut nomor invoice dan FP tidak berubah. *(Sejak 2026-11-18 berlaku juga untuk revisi PPN; FP batal kalau PPN dihapus, lihat keputusan 51.)*
33. `APPROVAL_ENFORCE` sengaja tetap `false` karena frontend belum menjalankannya, dan posisi Developer memang sementara. Keduanya bukan temuan.
34. Report invoice (poin 2 "masuk AR Report") dilewati sampai ada perintah. Report yang ada belum memfilter status invoice, dan nilai debit note di dalamnya selalu 0.
35. Blokir approve saat CT/PO batal tetap ditunda (2d). ~~Contract dan PO belum punya status batal atau addendum.~~ *(Dikoreksi 2026-11-10: Contract dan PO belum punya status batal. Fungsi adendum sudah ada di Contract, belum ada di PO.)*
36. Poin 1: create menghasilkan `pending` dan butuh `submit` terpisah agar sampai ke SPV. Dibiarkan dulu.
37. Aturan PDF yang masuk alur pembatalan (ditunda) dan belum dirinci di tabel progres: pengembalian 50% dengan opsi A/B/C di poin 6, tiga kondisi pembatalan invoice yang sudah bayar, dan Credit Note (2.1, 7A.1).

### Tahap 5: Cancel dan konversi Proforma Invoice, poin 6–6.3 (2026-11-10)

38. Poin 5 dilepas dulu. Tombol cancel dibuka tanpa syarat addendum atau pembatalan CT/PO; syarat itu menyusul bersama pekerjaan CT/PO. CT/PO adalah Contract atau Pre Order.
39. Pembagian kerja poin 6: frontend menangani peringatan (A) serta tombol konversi (B) dan Continue Cancel (C). Backend menangani pengajuan, approval, dan perubahan nilai. Frontend hanya mengirim jenis permintaan (cancel atau konversi), bukan nominal.
40. Cancel dan konversi sama-sama melewati AR & AP, SPV FAT Internal, lalu Direktur (6.1–6.3). Nilai invoice baru berubah setelah Direktur approve. ~~*(Perlu konfirmasi tim FAT: PDF menulis persetujuan Direktur hanya di opsi C.)*~~ Dikonfirmasi 2026-11-18: konversi (B) juga perlu persetujuan Direktur.
41. Konversi: `sub_total` dikali 50%, lalu PPN, PPh, dan `total` dihitung ulang dengan tarif master aktif.
42. ~~Rincian jasa di `invoice_service` tidak ikut berubah saat konversi. Opsi ikut berubah (rincian 50%, selisih pembulatan masuk ke baris terakhir) disimpan dalam keadaan nonaktif untuk jaga-jaga. Selama nonaktif, jumlah rincian tidak sama dengan `sub_total` invoice yang dikonversi.~~ Diganti 2026-11-18 oleh U5: konversi membuat invoice baru dengan rincian jasa 50%.
43. Alasan dan bukti wajib untuk cancel maupun konversi. ~~*(Perlu konfirmasi tim FAT: PDF menyebut bukti hanya di opsi C.)*~~ Dikonfirmasi 2026-11-18: bukti juga wajib di konversi (B).
44. AR & AP, SPV, atau Direktur boleh menolak dengan catatan wajib; invoice kembali ke `waiting for payment`.
45. Syarat pengajuan: status `waiting for payment`, ~~belum pernah ada bukti bayar di-upload~~ tidak ada bukti bayar yang sedang diverifikasi atau sudah diterima (diubah 2026-11-24: bukti bayar yang ditolak tidak lagi menghalangi; invoice dengan pembayaran diterima masuk alur [invoice-cancellation-paid.md](invoice-cancellation-paid.md)), dan `tax_invoice_status` masih `none`.
46. Cancel yang di-approve Direktur membuat status `cancelled`; item incoming tetap terpakai, sama seperti 2c.
47. ~~Debit note yang terhubung tidak ikut batal atau berubah.~~ ~~Diubah 2026-11-11: debit note yang terhubung ke invoice (`invoices.id_debit_note`) **ikut batal** saat cancel invoice di-approve Direktur.~~ Diubah 2026-11-18: Sales **memilih** saat mengajukan apakah debit note yang terhubung ikut dibatalkan. Rinciannya masih usulan, lihat "Rincian debit note ikut batal" dan "Usulan setelah jawaban klien" di Pertanyaan terbuka Tahap 5.
48. Nilai termin di Contract atau PO tidak ikut berubah saat konversi; penyesuaiannya menyusul bersama pekerjaan CT/PO.

### Revisi PPN (disepakati dan dikerjakan 2026-11-18)

49. `PATCH /invoices/revise/:id` menerima `tax_ppn`, `tax_pph_23`, `tax_pp_20`, dan `tax_pph_4_ayat_2`. Field yang tidak dikirim tetap memakai nilai lama.
50. Nominal PPN dihitung ulang dari tarif aktif hanya kalau centang PPN berubah. Kalau tidak berubah, nominal PPN lama dipakai supaya tetap sama dengan FP. `total` selalu dihitung ulang.
51. Dampak ke FP diterapkan saat SPV approve revisi:
    - FP belum diminta (`none`): tidak ada perubahan. Kalau PPN ditambahkan, FP diminta lewat jalur biasa.
    - FP diminta tapi belum terbit, lalu PPN dihapus: `tax_invoice_status` kembali `none`. Final Invoice tetap diminta otomatis saat bukti bayar pertama diterima.
    - Invoice sudah Final: `tax_invoice_status` kembali `requested` (keputusan 32). Kalau PPN dihapus, `tax_invoice_no`, `tax_invoice_date`, dan file `tax_invoice_attachment` dikosongkan, dan nomor FP lama dicatat di catatan riwayat `revision approved`. AR & AP hanya upload ulang Final Invoice. Kalau PPN ditambahkan, upload ulang wajib membawa nomor, tanggal, dan file FP baru.
52. Kalau yang berubah hanya PPh, FP tetap berlaku dan upload ulang boleh memakai data FP lama.

### Edit draft (disepakati dan dikerjakan 2026-11-18)

53. `PUT /invoices/:id` (status `pending` / `rejected`) hanya mengubah field yang diisi user saat create: `date`, `due_date`, `note`, `tax_ppn`, `tax_pph_23`, `tax_pp_20`, dan `tax_pph_4_ayat_2`. Field lain di body diabaikan. ~~Sebelumnya hampir semua kolom bisa ditimpa, dan `invoice_services` yang tidak dikirim membuat rincian jasa terhapus.~~
54. Saat edit draft, `ppn`, `pph`, `pp_20`, `pph_4_ayat_2`, dan `total` dihitung ulang dari `sub_total` dengan tarif aktif, sama seperti saat create. Rincian jasa dan `sub_total` tetap mengikuti termin CT/PO; debit note yang dibuat bersama invoice tidak ikut berubah.

### Checklist bukti potong dengan catatan per item (disepakati dan dikerjakan 2026-11-18)

55. Setiap item checklist disimpan sebagai `{ checked, note }` di kolom JSON `invoice_withholding_taxes.checklist`. ~~Sebelumnya setiap item hanya boolean.~~ Format boolean lama masih diterima di request dan dianggap tanpa catatan. Data lama dikonversi oleh `npm run db:sync-invoice-payments`.
56. Tolak bukti potong: `checklist` wajib dengan ke-10 item, baik `true` maupun `false`. Catatan wajib untuk item `false`, minimal satu item `false`, dan komentar serta screenshot tetap wajib (keputusan 26). ~~Sebelumnya `checklist` opsional saat tolak.~~
57. Terima bukti potong: ke-10 item wajib `checked: true` (keputusan 28), catatan per item opsional.
58. Kolom `checklist` hanya menyimpan hasil verifikasi terakhir; checklist yang ditolak tertimpa saat bukti potong berikutnya diverifikasi. Riwayat per penolakan belum disimpan.

## Pertanyaan terbuka

### Tahap 4

1. ~~**Signing**~~: terjawab 2026-10-29. Signing dihapus, `file_invoice` di-upload saat SPV approve. Sejak 2026-11-04 upload `file_invoice` saat approve juga dihapus; dokumen yang di-upload AR & AP adalah Final Invoice (3.1.1).
2. ~~**Reject oleh SPV di poin 2**~~ dan ~~**Proforma → Final**~~: dijawab dokumen klien yang diperbarui (2026-11-04, lihat "Perubahan dokumen kebutuhan"). Usulan di bawah disetujui dan dikerjakan pada 2026-11-04, kecuali 2d yang masih ditunda.

   **Reject SPV (poin 2)**

   - **2a. Reject karena pajak**: status tetap `rejected`. AR & AP boleh edit seperti saat `pending` (`PUT /invoices/:id`, semua field), lalu submit ulang ke SPV (`on verification`). Flow `invoice` / `rejected` ditambahkan agar muncul di My Task AR & AP.
   - **2b. Reject karena CT/PO**: `PATCH /invoices/reject/:id` menerima `reject_type`: `tax` (default) atau `ct/po cancelled`. Untuk `ct/po cancelled`, invoice masuk ke status final baru `cancelled`. Status ini tidak bisa diedit atau di-submit ulang.
   - **2c. Item incoming invoice**: saat ditolak karena CT/PO, item incoming asalnya tetap terpakai dan tidak dikembalikan ke daftar incoming. Sales membuat request baru dari CT/PO hasil addendum.
   - **2d. Blokir approve saat CT/PO CANCELLED**: ditunda sampai contract/PO punya status batal atau addendum. Saat ini status contract dan PO belum punya nilai tersebut. Sementara itu, SPV memilih sendiri jenis reject-nya.

   **Final Invoice (poin 3.1.1 dan 3 pilihan 2)**

   - **2e. Bentuk Final Invoice**: file `file_final_invoice` (array file di tabel `files`, seperti `tax_invoice_attachment`) ditambah penanda `is_final` dan `final_at`. Nomor invoice tidak berubah, sesuai catatan di 3.3 ("tidak mengubah nomor invoice").
   - **2f. Kapan di-upload**: wajib di-upload bersama FP di `PATCH /invoices/tax-invoice/:id`, baik FP diminta Sales (3.1) maupun otomatis setelah bukti bayar diterima (3 pilihan 2).
   - **2g. Invoice tanpa PPN**: invoice ini tidak butuh FP. Setelah bukti bayar pertama diterima, muncul tugas "Upload Final Invoice" di My Task AR & AP lewat endpoint yang sama tanpa field FP.
   - **2h. Request FP sebelum bayar (3.1)**: Final Invoice tetap diterbitkan saat itu juga, mengikuti 3.1.1, walaupun belum ada pembayaran.

### Tahap 5 (jawaban tim FAT diterima dan usulan U1–U16 disetujui 2026-11-18, sudah dikerjakan)

Pengerjaan kode Tahap 5 ditahan sejak 2026-11-10 sampai pertanyaan di bawah terjawab. Pertanyaan 1–4 terjawab 2026-11-18, usulan U1–U16 disetujui dan dikerjakan pada hari yang sama.

Tafsiran sementara poin 6: Sales klik satu tombol CANCEL dan mengisi alasan, lalu muncul peringatan (A) bahwa invoice dikonversi menjadi 50%. Kalau klien menerima, Sales klik konversi (B), dan ini jalur normal. Kalau klien tetap tidak mengikuti ketentuan, Sales klik Continue Cancel (C), yaitu batal penuh dengan alasan, bukti, dan persetujuan Direktur.

Pertanyaan untuk tim FAT:

1. ~~Kalau Proforma Invoice yang belum dibayar di-cancel, apakah normalnya invoice menjadi 50% dan klien tetap wajib membayar 50% itu? Kalimat "dana yang dapat dikembalikan/dialihkan 50%" membingungkan karena belum ada dana yang masuk.~~ Terjawab 2026-11-18: kalau belum ada pembayaran, klien wajib membayar 50% dulu sebelum di-cancel.
2. ~~Apakah konversi (B) juga perlu persetujuan Direktur, atau hanya batal penuh (C)? Jawaban ini menentukan keputusan 40.~~ Terjawab 2026-11-18: ya, B juga perlu persetujuan Direktur.
3. ~~Setelah konversi, apakah nomor invoice tetap, atau dibuat invoice baru? PDF menyebut "pembukaan inv konversi".~~ Terjawab 2026-11-18: dibuat invoice baru, nomornya melanjutkan nomor invoice terakhir.
4. ~~Apakah bukti wajib untuk konversi (B), atau hanya untuk batal penuh (C)? PDF mewajibkan alasan untuk semua cancel, tetapi bukti hanya disebut di opsi C. Jawaban ini menentukan keputusan 43.~~ Terjawab 2026-11-18: bukti juga wajib di B.

Catatan: PDF "Kebutuhan Sistem - FAT Internal (3)" yang diterima 2026-11-18 masih menulis persetujuan Direktur hanya di opsi C dan belum menyebut nomor invoice baru. Yang dipakai adalah jawaban tertulis tim FAT di atas.

Catatan yang bergantung pada jawaban di atas:

- **Status invoice setelah konversi 50% di-approve Direktur.** Usulan: kembali ke `waiting for payment` agar sisa 50% bisa ditagih. Alternatif: `cancelled`, atau invoice lama `cancelled` dan dibuat invoice baru bernilai 50%. Usulan lain yang terkait masih menunggu keputusan ini: nomor invoice tetap, tetap Proforma, konversi hanya sekali, dan nilai awal serta waktu konversi disimpan di kolom baru.

Rincian debit note ikut batal (keputusan 47, diubah 2026-11-11). Disetujui dan dikerjakan 2026-11-18 bersama U8–U12, dengan perubahan yang ditandai:

- **47a. Status baru**: enum `status` debit note ditambah `cancelled` (juga status progress `cancelled`), lewat script sinkronisasi database. Status ini final: debit note tidak bisa diedit, di-submit, di-approve, atau dibayar lagi, dan otomatis hilang dari My Task.
- **47b. Waktu batal**: debit note dibatalkan dalam transaksi yang sama saat Direktur approve cancel invoice (6.3), bukan saat Sales mengajukan. Kalau pengajuan ditolak di tahap mana pun, debit note tidak berubah.
- ~~**47c. Debit note sudah dibayar**: syarat pengajuan (keputusan 45) ditambah: debit note yang terhubung belum `paid`. Kalau sudah `paid`, pembatalannya masuk alur invoice yang sudah bayar (ditunda).~~ Diganti U10.
- **47d. Selama pengajuan berjalan**: pencatatan bayar debit note (`PATCH /debit-notes/paid/:id`) ditolak agar debit note tidak menjadi `paid` di tengah proses approval cancel. Submit dan approve debit note tetap boleh.
- **47e. Item incoming debit note**: tetap terpakai dan tidak dikembalikan ke daftar incoming, sama seperti 2c dan keputusan 46.
- ~~**47f. Konversi 50%**: debit note tidak ikut batal dan nilainya tidak berubah.~~ Diganti U8 dan U11.
- ~~**47g. Reject SPV karena CT/PO (2b)**: invoice yang menjadi `cancelled` lewat `reject_type: ct/po cancelled` juga membatalkan debit note-nya, agar aturannya sama. Ini mengubah kode Tahap 4 yang sudah selesai.~~ Dibatalkan 2026-11-18 (U12).

Usulan setelah jawaban klien (2026-11-18). Disetujui dan dikerjakan 2026-11-18:

Konversi 50% (B):

- **U1. Hasil approve Direktur**: invoice lama menjadi `cancelled` (status akhir), lalu backend otomatis membuat invoice baru bernilai 50%. Tafsiran jawaban no. 1: invoice lama digantikan invoice 50% yang ditagih seperti biasa. Alternatifnya, invoice lama baru batal setelah 50% dibayar.
- **U2. Nomor invoice baru**: memakai generator nomor yang sama (`GET /invoices/no/documents`), untuk company invoice lama, dengan bulan dan tahun saat Direktur approve. Contoh: `006/INV/TYS/XI/2026` dikonversi menjadi `012/INV/TYS/XI/2026` kalau nomor terakhir 011.
- **U3. Status invoice baru**: langsung `waiting for payment` (Proforma) dan masuk My Task Sales, tanpa create, submit, dan approve SPV lagi, karena konversinya sudah di-approve AR & AP, SPV, dan Direktur.
- **U4. Isi invoice baru**: company, customer, CT/PO, termin, mata uang, dan centang pajak disalin dari invoice lama. `sub_total` = 50% (dibulatkan); PPN, PPh, dan `total` dihitung ulang dengan tarif aktif. Tanggal = tanggal approve Direktur. `due_date` mempertahankan selisih hari dari invoice lama (kosong kalau di invoice lama kosong).
- **U5. Rincian jasa**: `invoice_services` disalin ke invoice baru dengan nilai 50% per baris; selisih pembulatan masuk ke baris terakhir, sehingga jumlahnya sama dengan `sub_total`. Rincian invoice lama tidak berubah. Ini menggantikan keputusan 42.
- **U6. Hubungan invoice**: kolom baru `invoices.id_invoice_converted_from` di invoice baru. Riwayat invoice lama mencatat nomor invoice baru, dan riwayat invoice baru mencatat nomor invoice lama.
- **U7. Konversi hanya sekali**: invoice hasil konversi tidak bisa diajukan cancel atau konversi lagi lewat alur ini, karena 50% adalah tagihan minimum.

Debit note (keputusan 47 diubah menjadi pilihan):

- **U8. Pilihan saat mengajukan**: kalau invoice punya debit note (`id_debit_note`), Sales wajib mengisi `cancel_debit_note` (`true`/`false`), baik untuk cancel maupun konversi. Kalau tidak punya, field ini diabaikan.
- **U9. Kalau `true`**: debit note dibatalkan saat Direktur approve. Rincian 47a, 47b, 47d, dan 47e tetap berlaku; 47d hanya berlaku kalau `cancel_debit_note` `true`.
- **U10. Debit note sudah `paid`**: hanya boleh memilih `false`. Pembatalannya masuk alur invoice yang sudah bayar (ditunda). Ini menggantikan 47c.
- **U11. Konversi dengan `false`**: `id_debit_note` disalin ke invoice baru, supaya debit note tetap terhubung ke invoice yang masih aktif. Ini menggantikan 47f.
- **U12. Reject SPV karena CT/PO (2b)**: debit note tidak ikut batal otomatis, karena pembatalan debit note sekarang pilihan Sales. 47g dibatalkan.

Teknis:

- **U13. Tabel pengajuan**: tabel baru `invoice_cancellations` berisi `id_invoice`, `type` (`cancel` / `convert`), `reason`, `cancel_debit_note`, `status`, `id_invoice_new`, serta user dan waktu tiap approve/reject. Bukti disimpan di tabel `files`. Satu invoice bisa punya beberapa pengajuan kalau ada yang ditolak, jadi riwayatnya tersimpan.
- **U14. Status invoice selama pengajuan**: status baru `cancellation requested` (My Task AR & AP), `cancellation reviewed` (My Task SPV FAT Internal), dan `cancellation verified` (My Task Direktur). Ditolak di tahap mana pun → kembali ke `waiting for payment`. Posisi approver diatur lewat approval flow (sementara Developer).
- **U15. Syarat pengajuan**: tetap keputusan 45, ditambah U7.
- **U16. Database**: status, tabel, dan kolom baru ditambahkan lewat `npm run db:sync-invoice-payments`.

### Alur pembatalan (ditunda)

4. Poin 5: data addendum/pembatalan CT/PO apa yang dipakai untuk mengaktifkan tombol cancel? *(Dilepas dulu, lihat keputusan 38.)*
5. ~~Poin 6: apakah pembatalan invoice yang belum bayar juga membatalkan debit note yang terhubung?~~ Terjawab 2026-11-10: tidak ikut batal. Diubah 2026-11-11: **ikut batal** (keputusan 47 dan rincian 47a–47g). Diubah 2026-11-18: **pilihan Sales** saat mengajukan (U8–U12).

### Report (ditunda)

6. Petty Cash Report: data petty cash berasal dari fitur mana (Payment Request, atau input manual)?

## Rancangan teknis Tahap 1–3

### Status invoice (`invoices.status` dan `invoice_verification_progress.status`)

Status baru: `payment verification` ✔, `payment proof rejected` ✔, `revision requested` ✔, `waiting for revision` ✔, `paid waiting wht` ✔, `wht verification` ✔, `wht rejected` ✔, `paid & clear` ✔. Status `approved`, `signing`, dan `paid` sudah dihapus (`paid` dipindahkan ke `paid & clear` lewat migrasi data).

### Tabel dan kolom baru

| Tabel / kolom                      | Isi                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invoice_payments` ✔               | `id_invoice`, `amount`, `transfer_date`, `bank_name`, `payment_method`, `status` (`verification`/`accepted`/`rejected`), `note` (Sales), `verification_note` (AR&AP), `verified_at`, `id_user_create`, `id_user_verify`. File bukti bayar lewat `File` (`fileable_type: invoice_payments`, `category: payment_proof`). |
| `invoices.tax_invoice_status` ✔    | `none` / `requested` / `issued`                                                                                                                             |
| `invoice_withholding_taxes` ✔      | Satu baris per jenis PPh: `id_invoice`, `tax_type` (`pph_23`/`pph_4_ayat_2`), `dpp`, `rate`, `amount`, `receipt_no`, `tax_period`, `receipt_date`, `checklist` (JSON), `status` (`waiting`/`verification`/`rejected`/`clear`), `note`, `note_reject`, user upload/verify, `uploaded_at`, `verified_at`. File bukti potong lewat `File` (`fileable_type: invoice_withholding_taxes`, `category: withholding_tax_receipt`). Screenshot penolakan menempel di riwayat `wht rejected` (`category: wht_reject_attachment`). |
| File lampiran revisi ✔             | `File` dengan `fileable_type: invoice_verification_progress`, `category: revision_attachment`, menempel di entri riwayat `revision requested`, jadi setiap permintaan revisi punya buktinya sendiri |

`invoices.payment_amount` dan `payment_date` dipakai sebagai ringkasan: total pembayaran yang diterima dan tanggal pembayaran terakhir, supaya report invoice yang ada tetap jalan.

### Endpoint

| Tahap | Endpoint                                            | Pelaku | Dari status                                   | Ke status                                              |
| ----- | --------------------------------------------------- | ------ | --------------------------------------------- | ------------------------------------------------------ |
| 1 ✔   | `PATCH /invoices/upload-payment/:id`                | Sales  | `waiting for payment`, `payment proof rejected` | `payment verification`                               |
| 1 ✔   | `PATCH /invoices/payment-accept/:id`                | AR&AP  | `payment verification`                        | `waiting for payment` (belum lunas), `paid waiting wht` / `paid & clear` (lunas) |
| 1 ✔   | `PATCH /invoices/payment-reject/:id`                | AR&AP  | `payment verification`                        | `payment proof rejected`                               |
| 2 ✔   | `PATCH /invoices/tax-invoice-request/:id`           | Sales  | `tax_invoice_status = none`                   | `tax_invoice_status = requested`                       |
| 2 ✔   | `PATCH /invoices/tax-invoice/:id`                   | AR&AP  | `tax_invoice_status = requested`              | `tax_invoice_status = issued`                          |
| 2 ✔   | `PATCH /invoices/revision-request/:id`              | Sales  | `waiting for payment`                         | `revision requested`                                   |
| 2 ✔   | `PATCH /invoices/revision-request-reject/:id`       | AR&AP  | `revision requested`                          | `waiting for payment`                                  |
| 2 ✔   | `PATCH /invoices/revise/:id`                        | AR&AP  | `revision requested`                          | `waiting for revision`                                 |
| 2 ✔   | `PATCH /invoices/revision-approve/:id`              | SPV    | `waiting for revision`                        | `waiting for payment`                                  |
| 2 ✔   | `PATCH /invoices/revision-reject/:id`               | SPV    | `waiting for revision`                        | `revision requested`                                   |
| 3 ✔   | `PATCH /invoices/:id/withholding-taxes/:whtId/upload` | Sales | `paid waiting wht`, `wht verification`, `wht rejected` (bukti potong `waiting` / `rejected`) | bukti potong `verification` |
| 3 ✔   | `PATCH /invoices/:id/withholding-taxes/:whtId/accept` | AR&AP | `wht verification` (bukti potong `verification`) | bukti potong `clear`; invoice `paid & clear` kalau semua clear |
| 3 ✔   | `PATCH /invoices/:id/withholding-taxes/:whtId/reject` | AR&AP | `wht verification` (bukti potong `verification`) | bukti potong `rejected`                         |

Kalau satu invoice punya lebih dari satu bukti potong, status invoice diturunkan dari semuanya: ada yang `verification` → `wht verification`; ada yang `rejected` → `wht rejected`; semua `clear` → `paid & clear`; selain itu `paid waiting wht`.

### Approval flow / My Task

- `approvalTargets.invoice` ditambah status baru di atas.
- Target baru `invoice tax invoice` membaca kolom `tax_invoice_status` (status `requested` → "Upload Tax Invoice (FP)") lewat opsi `statusField`. Di `GET /invoices`, flag-nya muncul sebagai `is_can_upload_tax_invoice`.
- Request FP dan permintaan revisi oleh Sales dicek terhadap flow `invoice` / `waiting for payment` (opsi `actAs` di `requireApprover`), sehingga Sales tetap bisa request FP saat invoice sedang `payment verification`.
- Upload bukti potong oleh Sales dicek terhadap flow `invoice` / `paid waiting wht` (`actAs`), sehingga Sales tetap bisa upload bukti potong jenis lain saat satu bukti potong sedang `wht verification`.

### Lain-lain

- ✔ `PUT /invoices/:id` hanya untuk `pending`; field `status` dan `tax_invoice_status` di body diabaikan. Revisi setelah approve lewat `PATCH /invoices/revise/:id`.
- Migrasi ENUM dan data dilakukan di DB1 dan DB2 lewat `npm run db:sync-invoice-payments`.

## Ringkasan perubahan endpoint per tahap

Semua endpoint berawalan `/api/invoices`.

| Tahap         | Baru                                                                                                   | Berubah                                                                                                     | Dihapus                           |
| ------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 0             | -                                                                                                      | `waiting-for-payment`: urutan argumen diperbaiki (endpoint-nya kemudian dihapus bersama signing)             | -                                 |
| 1             | `PATCH /upload-payment/:id`, `PATCH /payment-accept/:id`, `PATCH /payment-reject/:id`                  | `GET /:id` memuat `payments`                                                                                | `PATCH /pay/:id`                  |
| Hapus signing | -                                                                                                      | `PATCH /approve/:id` menerima `file_invoice` dan langsung ke `waiting for payment`                          | `PATCH /signing/:id`, `PATCH /waiting-for-payment/:id` |
| 3             | `PATCH /:id/withholding-taxes/:whtId/upload`, `PATCH /:id/withholding-taxes/:whtId/accept`, `PATCH /:id/withholding-taxes/:whtId/reject` | `PATCH /payment-accept/:id`: lunas → `paid waiting wht` (membuat `withholding_taxes`) atau `paid & clear`; `GET /:id` memuat `withholding_taxes` dan `wht_reject_attachment` di riwayat | Status `paid` |
| 2             | `PATCH /tax-invoice-request/:id`, `PATCH /revision-request/:id`, `PATCH /revision-request-reject/:id`, `PATCH /revise/:id`, `PATCH /revision-approve/:id`, `PATCH /revision-reject/:id` | `PATCH /tax-invoice/:id` hanya saat FP `requested`; `PUT /:id` hanya saat `pending`; `PATCH /payment-accept/:id` otomatis meminta FP; `GET` memuat `tax_invoice_status`, `is_can_upload_tax_invoice`, `tax_invoice_action_label`, dan `revision_attachment` di riwayat | - |
| 4 (reject, Final Invoice) | - | `PATCH /approve/:id` dan `PATCH /revision-approve/:id` tidak lagi menerima `file_invoice`; `PATCH /reject/:id` menerima `reject_type` (`tax` → `rejected`, `ct/po cancelled` → `cancelled`); `PUT /:id` dan `PATCH /submit/:id` juga untuk `rejected`; `PATCH /tax-invoice/:id` wajib `file_final_invoice` (field FP hanya untuk invoice ber-PPN) dan menandai invoice Final; `PATCH /payment-accept/:id` juga meminta Final Invoice untuk invoice tanpa PPN; `GET` memuat `reject_type`, `file_final_invoice`, `is_final`, `final_at` | - |
| 5 (cancel, konversi) | `PATCH /cancellation-request/:id`, `PATCH /cancellation-approve/:id`, `PATCH /cancellation-reject/:id` | `GET /:id` memuat `cancellations`, `converted_from`, `converted_to`. Debit note: status `cancelled` final (edit, hapus, submit, approve, reject, bayar ditolak 409); `PATCH /debit-notes/paid/:id` ditolak selama pembatalan invoice yang ikut membatalkannya berjalan | - |

Body dan contoh setiap endpoint ada di [invoice-frontend.md](invoice-frontend.md).

## Catatan Tahap 0–2 (sudah dikerjakan)

### Untuk frontend

Panduan lengkap untuk frontend (termasuk Faktur Pajak dan revisi) ada di [invoice-frontend.md](invoice-frontend.md). Ringkasan Tahap 1:

`PATCH /invoices/upload-payment/:id` (Sales)

| Field            | Isi                                                                    |
| ---------------- | ---------------------------------------------------------------------- |
| `amount`         | Wajib, bilangan bulat > 0, tidak boleh melebihi sisa tagihan           |
| `transfer_date`  | Wajib                                                                  |
| `payment_method` | `transfer` (default) atau `cash`                                       |
| `bank_name`      | Wajib untuk `transfer`                                                 |
| `note`           | Opsional                                                               |
| `payment_proof`  | Wajib, array file (format sama dengan upload file lain), minimal 1     |

`PATCH /invoices/payment-accept/:id` dan `/payment-reject/:id` (AR&AP): body `{ note }`. Untuk reject, `note` wajib. Aksi selalu untuk bukti bayar yang sedang diverifikasi, jadi tidak perlu id pembayaran.

`GET /invoices/:id` sekarang memuat `payments`: semua bukti bayar (termasuk yang ditolak) beserta `payment_proof`, `user_create`, dan `user_verify`. Sisa tagihan = `total − payment_amount`. `payment_amount` adalah jumlah pembayaran yang diterima.

### Untuk deploy

Sudah dijalankan pada 2026-10-29 di `db_erp_tys` dan `db_erp_tys_2`:

1. `npm run db:sync-invoice-payments`: tabel `invoice_payments` dibuat dan status baru ditambahkan. Tidak ada pembayaran lama yang dipindahkan, karena 3 invoice `paid` yang ada tidak punya `payment_amount`. Script ini aman dijalankan ulang di environment lain.
2. Approval flow invoice: flow `payment verification` (id 35) dan `payment proof rejected` (id 36) ditambahkan. Label flow `waiting for payment` (id 18) diubah menjadi "Upload Payment Proof Invoice".
3. Tahap 2: `npm run db:sync-invoice-payments` dijalankan ulang. Kolom `invoices.tax_invoice_status` ditambahkan: 2 invoice yang sudah punya nomor FP menjadi `issued`, 3 invoice `paid` ber-PPN tanpa FP menjadi `requested` (muncul di My Task AR&AP). Flow `revision requested` (id 37), `waiting for revision` (id 38), dan `invoice tax invoice` / `requested` (id 39) ditambahkan.

Untuk sementara **semua flow invoice memakai posisi Developer**. Setelah testing selesai, posisi diganti mengikuti peran di dokumen:

| Status flow                                   | Peran di dokumen             |
| --------------------------------------------- | ---------------------------- |
| `pending`, `payment verification`, `revision requested` | AR & AP            |
| `invoice tax invoice` / `requested`           | AR & AP                      |
| `on verification`, `waiting for revision`     | SPV FAT Internal / Manager   |
| `waiting for payment`, `payment proof rejected` | Sales                      |

Flow `approved` (id 16) dan `signing` (id 17) dinonaktifkan pada 2026-10-29 karena signing dihapus.

Tahap 3 dan Tahap 4 (bukti potong, reject, dan Final Invoice, 2026-11-04) ~~**belum dijalankan** di database~~ *(diperbarui 2026-11-10: kolom dan tabel pada langkah 1 sudah ada di kedua database; langkah 2–4 dikerjakan 2026-11-10, sementara posisi Developer)*:

1. `npm run db:sync-invoice-payments`: membuat tabel `invoice_withholding_taxes`, mengganti status `paid` dengan `paid waiting wht` / `wht verification` / `wht rejected` / `paid & clear` (invoice lama `paid` menjadi `paid & clear`), menambah status `cancelled`, status progress `final invoice requested` / `final invoice issued` / `cancelled`, dan kolom `reject_type`, `is_final`, `final_at` (file Final Invoice disimpan di tabel `files`). Invoice lama tetap Proforma (`is_final = false`). Invoice yang sudah `rejected` dari alur lama ikut bisa diedit dan di-submit ulang oleh AR & AP.
2. Approval flow: tambah flow `invoice` / `rejected` (label "Revise & Resubmit Invoice", posisi AR & AP; sementara Developer). `npm run db:setup-approval-flows` membuatnya kalau belum ada.
3. Ubah label flow `invoice tax invoice` / `requested` (id 39) menjadi "Upload Final Invoice & Tax Invoice (FP)", karena label di database dipakai lebih dulu daripada label default di kode.
4. Approval flow bukti potong: `invoice` / `paid waiting wht` dan `wht rejected` (Sales), `invoice` / `wht verification` (AR & AP); sementara Developer. `npm run db:setup-approval-flows` membuatnya kalau belum ada.

Checklist bukti potong dengan catatan per item (2026-11-18) **belum dijalankan** di database:

1. `npm run db:sync-invoice-payments`: checklist bukti potong yang tersimpan sebagai `{ item: boolean }` dikonversi menjadi `{ item: { checked, note } }`. Baris yang sudah berformat baru dilewati, jadi aman dijalankan ulang.

Tahap 5: cancel dan konversi Proforma Invoice (2026-11-18) ~~**belum dijalankan** di database~~ *(dicek 2026-11-24: status `cancellation *`, tabel `invoice_cancellations`, dan flow `cancellation requested/reviewed/verified` sudah ada di DB1 dan DB2)*:

1. `npm run db:sync-invoice-payments`: menambah status invoice `cancellation requested` / `cancellation reviewed` / `cancellation verified`, status progress `cancellation requested` / `cancellation reviewed` / `cancellation verified` / `cancellation rejected` / `converted`, kolom `invoices.id_invoice_converted_from`, tabel `invoice_cancellations`, dan status `cancelled` di debit note beserta progress-nya.
2. `npm run db:setup-approval-flows`: membuat flow `invoice` / `cancellation requested` (AR & AP), `cancellation reviewed` (SPV FAT Internal), dan `cancellation verified` (Direktur) kalau belum ada. Posisi approver sementara Developer; atur posisi sebenarnya lewat `/api/approval-flows`.
