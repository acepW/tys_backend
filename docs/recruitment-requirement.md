# Recruitment: Progres Form Recruitment Request dan Candidate Database

Dokumen ini membandingkan contoh form dari klien ("Form Recruitment Request" dan "Form New Candidat", diterima 2026-11-18) dengan sistem, mencatat keputusan yang dipakai, dan pertanyaan yang masih perlu didiskusikan dengan klien. Perbarui kolom **Status** setiap kali satu poin selesai.

Panduan endpoint untuk frontend ada di [recruitment-frontend.md](recruitment-frontend.md).

| Status            | Arti                                                    |
| ----------------- | ------------------------------------------------------- |
| Sudah ada         | Sudah berjalan sebelum pekerjaan ini                     |
| Selesai           | Sudah dikerjakan sesuai form                             |
| Belum             | Masuk rencana, belum dikerjakan                          |
| Ditunda           | Menunggu jawaban klien                                   |
| Tidak dikerjakan  | Sengaja dibiarkan, lihat keputusan                       |

## Pembagian tahap

| Tahap | Isi                                                                                     | Kondisi |
| ----- | --------------------------------------------------------------------------------------- | ------- |
| A     | Candidate Database: tanpa approval, field lisensi, CV wajib                             | Selesai (2026-11-18) |
| B     | Field Recruitment Request: Request Number, Current Division Member, Job Requirement dipecah 3, Salary Range | Selesai (2026-11-18) |
| C     | Approval Recruitment Request: 4 tahap, reject ke tahap tertentu, hak edit per tahap      | Selesai (2026-11-18) |
| D     | Company/Department otomatis dari pengaju, HR & Direktur memilih, hierarki Company → Department → Division | Ditunda, menunggu klien (pertanyaan 1–3) |

## Form Recruitment Request

### Bagian 1

| No | Form                      | Sistem                                            | Tahap | Status    | Catatan |
| -- | ------------------------- | ------------------------------------------------- | ----- | --------- | ------- |
| 1  | Request Number (otomatis) | `request_no`                                      | B     | Selesai   | Keputusan 1 |
| 2  | Company (otomatis dari pengaju; Divisi HR dan Direktur bisa memilih) | `id_company`, dipilih manual | D | Ditunda | Pertanyaan 1 dan 2 |
| 3  | Departemen (otomatis dari pengaju; Divisi HR dan Direktur memilih departemen di company itu) | `id_department`, dipilih manual | D | Ditunda | Pertanyaan 1–3 |
| 4  | Divisi (sesuai divisi di departemen itu) | `id_division`, dipilih manual | D | Ditunda | Pertanyaan 3 |
| 5  | Position (manual)         | `id_position` dari master Position                | -     | Sudah ada | Keputusan 4 |
| 6  | Level (Junior Staff s.d. Senior Manager) | `id_level` dari master Level       | -     | Tidak dikerjakan | Keputusan 5 |
| 7  | Type of Request (Additional / Replacement) | `request_type`: `additional member` / `replacement` | - | Sudah ada | |
| 8  | Current Division Member   | `current_division_member`                         | B     | Selesai   | Keputusan 6 |
| 9  | Required Number of People | `number_of_people`                                | -     | Sudah ada | |
| 10 | Hiring Deadline           | `hiring_deadline`                                 | -     | Sudah ada | |
| -  | Hiring Status (tambahan dari user, 2026-11-18) | `hiring_status`: `open` / `close` | - | Sudah ada | Bisa diisi saat create; setelah `approve` diubah lewat `PATCH /requests/hiring-status/:id` |

### Bagian 2 dan 3

| No | Form                        | Sistem                                   | Tahap | Status    | Catatan |
| -- | --------------------------- | ---------------------------------------- | ----- | --------- | ------- |
| A1 | Job Requirement: Hard Skill | `hard_skill`                             | B     | Selesai   | Keputusan 7 |
| A2 | Job Requirement: Soft Skill | `soft_skill`                             | B     | Selesai   | Keputusan 7 |
| A3 | Job Requirement: Others     | `other_requirement`                      | B     | Selesai   | Keputusan 7 |
| B  | Job Description             | `job_description`                        | -     | Sudah ada | |
| C  | Salary Range                | `salary_min`, `salary_max`               | B     | Selesai   | Keputusan 8 |
| -  | Applicant's reasons         | `reason`                                 | -     | Sudah ada | |

### Approval

| No | Form                                                                 | Tahap | Status  | Catatan |
| -- | -------------------------------------------------------------------- | ----- | ------- | ------- |
| 1  | HR Staff: edit Job Requirement dan Job Description, lihat before/after, approve/reject dengan komentar | C | Selesai | Keputusan 9–11. Before/after sudah ada (`revisions`) |
| 2  | SPV HR: ubah/isi Salary Range, reject ke HR Staff, reject ke Requestor, approve | C | Selesai | Keputusan 9–11 |
| 3  | Manager HR: reject ke SPV (ubah Salary Range), reject ke Requestor, approve | C | Selesai | Keputusan 9–11 |
| 4  | Direktur: reject ke SPV (ubah Salary Range), reject ke Requestor, approve | C | Selesai | Keputusan 9–11 |

## Form New Candidate (Candidate Database)

| Form                                            | Sistem                                   | Tahap | Status    | Catatan |
| ----------------------------------------------- | ---------------------------------------- | ----- | --------- | ------- |
| Company, Departemen, Divisi, Level, Position (dari Recruitment Request yang open) | Disalin dari request `approve` + `open` | - | Sudah ada | |
| HR PIC (HR yang mengisi data kandidat)          | `user_request` (pembuat data)            | -     | Sudah ada | Tanpa field baru |
| Candidate Name, Source, Phone Number            | `name`, `source`, `phone_number`         | -     | Sudah ada | |
| Email (opsional)                                | `email`                                  | -     | Sudah ada | |
| CV (upload)                                     | `files_cv`, wajib minimal 1              | A     | Selesai   | Keputusan 14 |
| Professional Certification/License to Be Used by the Company (Yes/No) | `has_professional_license` | A | Selesai | Keputusan 13 |
| Certification/License Type (7 pilihan, Other teks bebas) | `license_type`, `license_type_other` | A | Selesai | Keputusan 13 |
| Tidak ada pengajuan atau approval, langsung terbuat | Approval kandidat dihapus             | A     | Selesai   | Keputusan 12 |
| Hiring Status (tambahan dari user, 2026-11-18) | `hiring_status`, teks bebas            | A     | Selesai   | Keputusan 16 |

## Keputusan yang dipakai (disepakati 2026-11-18)

1. **Request Number**: `REC-{INITIAL}-{MM}-{YYYY}-{0001}`, dibuat backend saat create. Urutan per initial company dan mulai lagi dari 0001 setiap tahun. Request lama diberi nomor lewat script sesuai urutan id, dengan bulan dan tahun dari tanggal dibuat. Request lama tanpa company tetap tanpa nomor. Nomor tidak berubah walaupun company diedit.
2. *(Ditunda, pertanyaan 1–2.)* Company dan department sementara tetap dipilih manual.
3. *(Ditunda, pertanyaan 3.)* Dropdown department dan division sementara tanpa filter.
4. **Position** tetap dipilih dari master Position ("manual" = dipilih user, bukan otomatis).
5. **Level** dibiarkan apa adanya; isinya diatur user lewat master Level. Tidak ada script yang menambah level.
6. **Current Division Member**: angka ≥ 0, diisi manual, wajib saat create.
7. **Job Requirement** dipecah menjadi `hard_skill`, `soft_skill`, dan `other_requirement` (teks). Isi `job_requirement` lama dipindah ke `other_requirement` lewat script. Field `job_requirement` tidak diterima lagi dan hanya disimpan untuk data lama.
8. **Salary Range**: `salary_min` dan `salary_max` (angka ≥ 0, min ≤ max). Opsional saat create; diisi atau diubah SPV HR.
9. **Tahap approval**: `request hr staff` → `request spv hr` → `request manager hr` → `request director` → `approve`. Request lama di `request spv/manager hr` dipindah ke `request spv hr`. Pengaju dari divisi HR mulai di `request spv hr`.
10. **Hak edit per tahap** (perubahan tetap tercatat sebagai before/after di `revisions`):
    - `request hr staff`: HR Staff mengubah `hard_skill`, `soft_skill`, `other_requirement`, `job_description`.
    - `request spv hr`: SPV HR mengubah `salary_min`, `salary_max`.
    - `request manager hr`, `request director`: tidak bisa diedit.
    - `returned to requester`: requester mengubah semua field, lalu submit ulang.
    - Field lain yang dikirim dengan nilai sama diabaikan; field lain yang nilainya berubah ditolak.
    - Pengecekan user di tahap HR Staff dan SPV HR memakai approval flow tahap itu (mengikuti `APPROVAL_ENFORCE`).
11. **Reject** wajib komentar dan memilih tujuan (`reject_to`):
    - HR Staff: ke Requestor.
    - SPV HR: ke HR Staff atau ke Requestor.
    - Manager HR dan Direktur: ke SPV HR (untuk ubah Salary Range) atau ke Requestor.
    - Ke Requestor: status `returned to requester`. Requester memperbaiki lalu submit ulang (`PATCH /requests/resubmit/:id`) ke HR Staff, atau ke SPV HR untuk divisi HR.
    - Dari SPV HR, request naik lagi lewat Manager HR → Direktur.
    - Status `reject` (ditolak final) tidak dipakai lagi dan hanya ada di data lama.
    - Approve: komentar opsional.
12. **Kandidat tanpa approval**: kandidat langsung terbuat tanpa status. Kolom `status` kandidat, endpoint approve/reject kandidat, dan approval flow `recruitment candidate` dihapus. Setiap kandidat aktif bisa langsung masuk Interview HR. Kandidat lama yang `pending` maupun `reject` menjadi kandidat biasa; catatan penolakan tetap ada di `verification_progress`.
13. **Lisensi**: `has_professional_license` (boolean, wajib saat create). Kalau `true`, `license_type` wajib (satu pilihan dari 7); kalau `other`, `license_type_other` wajib. Kalau `false`, keduanya dikosongkan. Tidak memakai kolom JSON. Kandidat lama dibiarkan kosong.
14. **CV** wajib minimal 1 file saat create, dan tidak boleh dikosongkan saat edit.
15. Field kandidat di luar form (`job_title`, `disc`, `recruitment_process`, jadwal interview, `files_application_form`) tetap ada dan diisi lewat edit.
16. **Hiring status kandidat**: `hiring_status`, teks bebas (sementara, belum ada daftar nilai), opsional, bisa diubah HR kapan saja. Terpisah dari `hiring_status` request (open/close) dan tidak memengaruhi alur step kandidat.

## Pertanyaan untuk klien

Menentukan Tahap D. Sementara itu company, department, dan division tetap dipilih manual tanpa filter.

1. **Company pengaju.** Data user di sistem belum punya company, hanya department dan division. Usulan: tambah company di master user, lalu company dan department request diisi otomatis dari user pengaju. Alternatif: diambil dari data karyawan (master Employee) yang dicocokkan dengan user, tapi saat ini user dan karyawan belum terhubung.
2. **Siapa "Direktur"** yang boleh memilih company dan department. Usulan: user yang posisinya terdaftar sebagai approver tahap Direktur di approval flow Recruitment Request. Divisi HR dikenali dari kode atau nama divisinya, seperti sekarang.
3. **Hierarki Company → Departemen → Divisi.** Di master data, departemen belum terhubung ke company dan divisi belum terhubung ke departemen. Usulan: tambah company di master departemen dan departemen di master divisi, lalu isi ulang master yang sudah ada. Pertanyaan: apakah satu departemen hanya milik satu company, dan satu divisi hanya milik satu departemen?
