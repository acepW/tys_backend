# Recruitment: Hiring Status, Interview HR, dan Interview User (perubahan klien 2026-11-24)

Analisis dokumen klien yang diterima 2026-11-24 terhadap sistem, beserta rancangan, tahapan, dan pertanyaan. **Status: rancangan disetujui 2026-11-24 (semua default, H7 dijawab). Fase H-A s.d. H-D selesai di kode (2026-11-24); H-E (dokumen frontend dan test) sudah ikut dikerjakan per fase.** Tracking recruitment sebelumnya: [recruitment-requirement.md](recruitment-requirement.md); panduan endpoint yang berlaku sekarang: [recruitment-frontend.md](recruitment-frontend.md).

Dokumen klien:

- MOCK UP ERP - RECRUITMENT REQUEST (Pengaju): form dan approval Recruitment Request.
- MOCK UP ERP - Candidat Database: kolom list dan 15 hiring status.
- MOCK UP ERP - HR Interviews: form buat (jadwal) dan isi hasil Interview HR.
- MOCK UP ERP - User Interviews: form buat (jadwal, beberapa interviewer) dan isi hasil Interview User.
- Laporan Interview HR: isi laporan Interview HR (skala KS/K/C/B/BS).
- Offering Letter dan seterusnya: **belum ada dokumennya**, tidak termasuk rancangan ini.

## 1. Alur approval Recruitment Request

Dicek terhadap gambar: **sudah sesuai**, tidak ada perubahan.

| Tahap | Gambar | Sistem (keputusan 9–11 di recruitment-requirement.md) |
| --- | --- | --- |
| HR Staff | Edit Job Requirement dan Job Description, before/after terlihat, approve/reject dengan komentar | `request hr staff`: ubah `hard_skill`, `soft_skill`, `other_requirement`, `job_description`; `revisions` before/after; reject ke Requestor |
| SPV HR | Ubah/isi Salary Range, reject ke HR Staff, reject ke Requestor, approve | `request spv hr`: ubah `salary_min`/`salary_max`; reject ke HR Staff atau Requestor |
| Manager HR | Reject ke SPV (ubah Salary Range), reject ke Requestor, approve | `request manager hr`: reject ke SPV HR atau Requestor |
| Direktur | Reject ke SPV (ubah Salary Range), reject ke Requestor, approve | `request director`: reject ke SPV HR atau Requestor |

Bagian form yang masih terbuka sama seperti sebelumnya:

- Company dan Departemen otomatis dari pengaju (HR dan Direktur boleh memilih): **masih ditunda**, karena user belum punya company (pertanyaan 1–2 di recruitment-requirement.md).
- Divisi sesuai departemen: **sudah bisa** sejak hierarki Department → Division → Position (2026-11-24, [org-hierarchy.md](org-hierarchy.md)); kombinasi yang tidak cocok ditolak.
- Level (Junior Staff s.d. Senior Manager): diatur lewat master Level (keputusan 5).

## 2. Hiring status kandidat

Sekarang `hiring_status` kandidat berupa teks bebas (keputusan 16), dan semuanya masih kosong di database. Klien memberi 15 nilai, yang bisa diubah manual atau berubah otomatis dari aksi berikutnya.

| No | Hiring status (klien) | Nilai sistem (usulan) | Berubah otomatis saat | Tersedia |
| -- | --- | --- | --- | --- |
| 1 | Menghubungi | `contacting` | Kandidat dibuat (H2) | Rancangan ini |
| 2 | No Respond | `no response` | Manual | Rancangan ini |
| 3 | Interview HR | `hr interview` | Interview HR dijadwalkan (dibuat) | Rancangan ini |
| 4 | No Show (HR Interviews) | `hr interview no show` | HR mengisi kehadiran Interview HR: No Show | Rancangan ini |
| 5 | Ditolak (HR Interviews) | `hr interview rejected` | Hasil Interview HR: Tidak Direkomendasikan | Rancangan ini |
| 6 | Interview User | `user interview` | Hasil Interview HR: Direkomendasikan | Rancangan ini |
| 7 | No Show (User Interviews) | `user interview no show` | HR mengisi kehadiran Interview User: No Show | Rancangan ini |
| 8 | Ditolak (User Interviews) | `user interview rejected` | Hasil Interview User: Tidak Diterima (H5) | Rancangan ini |
| 9 | Pertimbangan (User Interviews) | `user interview consideration` | Hasil Interview User: Dipertimbangkan (H5). Dipertahankan 2 minggu, reminder H-3 (H6) | Rancangan ini |
| 10 | Offering Letter | `offering letter` | Hasil Interview User: Diterima (H5) | Rancangan ini |
| 11 | Ditolak oleh kandidat | `rejected by candidate` | Manual (sampai dokumen Offering ada) | Manual dulu |
| 12 | Negosiasi | `negotiation` | Manual (sampai dokumen Offering ada) | Manual dulu |
| 13 | Work Contract | `work contract` | Offering diterima / HR upload offering yang sudah ditandatangani (GA bisa menarik data untuk form penyerahan aset) | Manual dulu |
| 14 | Onboarding | `onboarding` | Manual (sampai dokumen Contract ada) | Manual dulu |
| 15 | No Show (kontrak) | `contract no show` | 2 hari HR tidak upload kontrak | Manual dulu |

"Ada beberapa yang kurang berdasarkan action selanjutnya": status 11–15 bergantung pada Offering Letter dan Contract yang dokumennya belum ada, jadi untuk sementara hanya bisa diubah manual. Status 1–10 terhubung ke aksi di rancangan ini.

Manual: `PATCH /recruitment/candidates/hiring-status/:id` dengan `hiring_status` dan `note`; setiap perubahan (manual maupun otomatis) tercatat di riwayat kandidat.

List Candidate Database (kolom klien):

| Kolom | Sumber |
| --- | --- |
| No, Name + Phone Number | Kandidat |
| Request Number | Recruitment Request (`request_no`) |
| Position + Departement | Kandidat (disalin dari request) |
| Interview HR: Tanggal & Jam, Offline/Online, PIC HR, Status interview HR | Interview HR terakhir |
| Interview User: Tanggal & Jam, Offline/Online, PIC User, Status interview user | Interview User terakhir (per interviewer) |
| Hiring Status | `hiring_status` |

## 3. Interview HR

Dua langkah: **buat** (jadwal) lalu **isi hasil** setelah interview. Hasil Direkomendasikan / Tidak Direkomendasikan mengubah hiring status (no. 5 dan 6).

**Buat (HR):**

| Bagian | Isi | Sistem |
| --- | --- | --- |
| 1. Recruitment Request | Company, Departemen, Divisi, Level, Position, PIC | Dari kandidat/request, read-only. PIC = HR yang membuat interview |
| 2. Candidate Information | Nama, Birth Date / Birth Place / Address (opsional, bisa diisi setelah interview HR), Source, Phone, Email, CV (preview + upload tambahan), Application Form (upload, opsional) | Dari kandidat. **Baru di kandidat**: `birth_date`, `birth_place`, `address` (sekarang hanya ada di Offering). CV dan application form sudah ada (`files_cv`, `files_application_form`) |
| 3. HR Interview Schedule | Date & Time, Method Online/Offline, Interview Room (offline) / Link (online) | **Pindah ke dokumen Interview HR** (sekarang di kandidat: `hr_interview_*`) |

**Isi hasil (HR Staff, setelah jadwal lewat):**

| Bagian | Isi | Sistem (usulan) |
| --- | --- | --- |
| 1 | Status Kehadiran: Datang / No Show | `attendance`: `attended` / `no show`. No Show → hiring status 4, dokumen selesai |
| 2 | Hasil Psikotes, tabel bisa tambah baris: Nama Alat Tes, Deskripsi, Upload Hasil | Tabel anak `recruitment_psychotests` (nama alat tes, deskripsi, file) |
| 3 | Laporan Interview HR sesuai form klien + tombol Direkomendasikan / Tidak Direkomendasikan | Nilai per item laporan (H2) + `description` (Deskripsi) + `recommendation`: `recommended` / `not recommended` |

**Laporan Interview HR** (dari dokumen klien), skala KS (Kurang Sekali), K (Kurang), C (Cukup), B (Baik), BS (Baik Sekali):

| Bagian | Item |
| --- | --- |
| Header | Nama, Posisi yang dilamar, Tanggal Interview, Pewawancara (H9) |
| A. Gaya Kerja | 1. Respon terhadap Lingkungan dan Jobdesk (Grafik I): a–d (4 item). 2. Respon terhadap Kondisi Tekanan / Stres Kerja (Grafik II): a–d. 3. Respon terhadap Diri / Self Image (Grafik III): a–d |
| B. Pola Kerja * | Produktivitas, Ketelitian kerja, Konsistensi, Daya Tahan dan Ketekunan (masing-masing dengan uraian) |
| C. Hasil Interview, Faktor Utama | 1–11: Pendidikan Formal, Pengetahuan Umum, Pengalaman Kerja, Pengetahuan Teknis, Keterampilan Teknis, Motivasi, Kemampuan Komunikasi, Kepercayaan Diri, Penyesuaian Diri, Etika, Kerja Sama (masing-masing dengan uraian) |
| C. Hasil Interview, Faktor Lain | 12. Kemampuan Memimpin *, 13. Kemampuan Bahasa Mandarin * |
| Penutup | Deskripsi (teks), Keputusan: Direkomendasikan / Tidak direkomendasikan |

**Master data Laporan Interview** (diminta klien): item laporan disimpan di master supaya HR bisa menambah/mengubah/menonaktifkan item tanpa perubahan kode. Usulan tabel `recruitment_report_items` (satu daftar untuk Interview HR dan Interview User, H7): bagian (mis. "A. Gaya Kerja"), kelompok + uraiannya (mis. "1. Respon terhadap Lingkungan dan Jobdesk (Grafik I)"), nama item, uraian item, opsional (tanda *), urutan, aktif. Item form HR di atas diisi lewat script. Nilai disimpan per interview dengan **salinan** nama bagian/item, supaya laporan lama tidak berubah walau master diubah.

## 4. Interview User

Sama seperti Interview HR: **buat** (jadwal, beberapa interviewer) lalu **isi hasil**.

**Buat (HR):**

| Bagian | Isi | Sistem (usulan) |
| --- | --- | --- |
| 1. Recruitment Request | Company, Departemen, Divisi, Level, Position, PIC HR | Dari kandidat/request, read-only |
| 2. Candidate Information | Nama, Source, Phone, Email, CV (preview + upload tambahan), Application Form, **Hasil Psikotes** (deskripsi + preview lampiran), **Laporan Interview HR** (deskripsi + detail bisa dibuka) | Dari kandidat dan Interview HR terakhir yang Direkomendasikan |
| 3. User Interview Schedule | **Bisa beberapa interviewer** (User #1, #2, ...): User Name (direct leader: SPV, Manager, Direktur), Position (otomatis), Date & Time, Method, Room/Link | Tabel anak `recruitment_user_interviewers`, satu baris per interviewer dengan jadwalnya sendiri. Position diambil dari user |

**Isi hasil:**

| Pelaku | Isi | Sistem (usulan) |
| --- | --- | --- |
| HR | Status Kehadiran: Datang / No Show (per interviewer) | `attendance` per baris interviewer |
| User (interviewer) | Laporan Interview User (**sama dengan form HR**, H7) + tombol Diterima / Dipertimbangkan / Tidak Diterima | Nilai per item + `description` + `decision`: `accepted` / `considered` / `not accepted`, per interviewer |

Hasil kandidat dari beberapa interviewer mengikuti H5. Interviewer melihat tugasnya lewat endpoint "interview saya" (H11).

## Perbedaan dengan sistem sekarang

| Area | Sekarang | Perubahan |
| --- | --- | --- |
| Hiring status kandidat | Teks bebas, manual | 15 nilai tetap; otomatis dari aksi + manual (bagian 2) |
| Jadwal interview | Di kandidat (`hr_interview_*`, `user_interview_*`); jadwal user diisi saat Interview HR passed | Di dokumen Interview HR dan di setiap interviewer Interview User. Kolom lama dipertahankan untuk data lama, tidak dipakai lagi (ditandai di dokumen) |
| Interview HR | Satu form: `psychotest_result`, `interview_result` (teks), `decision` passed/not passed, `work_system`, `salary`; **pakai approval** (pending/approve/reject) | Buat (jadwal) → isi (kehadiran, psikotes per baris, laporan per item, rekomendasi). **Tanpa approval** (H14) |
| Interview User | Satu form: `assessment`, `decision` accepted/not accepted, gaji/benefit/tanggal aktif rekomendasi; **pakai approval**; satu interviewer | Beberapa interviewer, masing-masing jadwal, kehadiran, laporan, dan keputusan (Diterima/Dipertimbangkan/Tidak Diterima). **Tanpa approval** |
| Syarat tahap berikutnya | Interview User butuh Interview HR approve + passed; Offering butuh Interview User approve + accepted | Interview User butuh Interview HR Direkomendasikan; Offering butuh hasil Interview User Diterima |
| Laporan interview | Teks bebas | Master item + nilai KS–BS per item |
| Data kandidat | Tanggal/tempat lahir dan alamat hanya di Offering | Ditambah di kandidat (opsional); Offering mengambil default dari kandidat |

## Tahapan

| Fase | Isi | Status |
| --- | --- | --- |
| H-A | Hiring status 15 nilai (otomatis + manual + riwayat), kolom baru kandidat, list Candidate Database sesuai kolom klien | Selesai (2026-11-24), kecuali kolom ringkasan interview di list (ikut H-C/H-D) |
| H-B | Master Laporan Interview (HR dan User) + isi awal form HR | Selesai (2026-11-24) |
| H-C | Interview HR baru: buat (jadwal), isi kehadiran, psikotes, laporan, rekomendasi → hiring status; tanpa approval; migrasi data lama | Selesai (2026-11-24) |
| H-D | Interview User baru: beberapa interviewer, kehadiran, laporan dan keputusan per interviewer → hiring status; Pertimbangan 2 minggu + reminder; "interview saya"; migrasi data lama | Selesai (2026-11-24) |
| H-E | Dokumen frontend dan test | Selesai (2026-11-24): [recruitment-frontend.md](recruitment-frontend.md) bagian 2, 3, 4, 8; test di `tests/recruitment.test.js` dan `tests/recruitmentReportItem.test.js` |
| - | Offering Letter, Work Contract, Onboarding (status 11–15 otomatis), company/departemen otomatis di Recruitment Request | Menunggu dokumen/jawaban klien |

## Pertanyaan

Default dipakai kalau tidak dijawab lain. **2026-11-24: semua default disetujui; H7 dijawab klien.**

| No | Pertanyaan | Default |
| --- | --- | --- |
| H1 | Hiring status bisa diubah manual ke nilai mana pun, kapan pun (termasuk mundur), dengan catatan? | Ya, semua perubahan tercatat di riwayat kandidat |
| H2 | Hiring status awal kandidat baru? | Menghubungi |
| H3 | Status "Interview HR" diset saat Interview HR dijadwalkan (dibuat)? | Ya |
| H4 | Status "Interview User" diset saat hasil Interview HR Direkomendasikan (sesuai dokumen), bukan saat Interview User dijadwalkan? | Ya, sesuai dokumen |
| H5 | Dengan beberapa interviewer, kapan hasil kandidat ditentukan? | Setelah semua interviewer yang hadir mengisi keputusan: ada Tidak Diterima → Ditolak; selain itu ada Dipertimbangkan → Pertimbangan; semua Diterima → Offering Letter. No Show di salah satu jadwal → langsung No Show (User Interviews) |
| H6 | Pertimbangan 2 minggu: apa yang terjadi setelah 2 minggu, dan reminder H-3 lewat apa? | Tidak berubah otomatis. Sistem menyimpan batas waktu (14 hari) dan menandai `needs_decision_reminder` mulai H-3 di list dan "interview saya" (sistem belum punya notifikasi/email). Interviewer bisa mengganti keputusan Dipertimbangkan menjadi Diterima / Tidak Diterima selama status Pertimbangan |
| H7 | ~~Isi form Laporan Interview User belum dikirim. Pakai apa dulu?~~ | **Dijawab 2026-11-24: form Interview User sama dengan form Interview HR.** Keduanya memakai satu master item yang sama |
| H8 | Item bertanda * (seluruh bagian B. Pola Kerja, serta C.12 Kemampuan Memimpin dan C.13 Kemampuan Bahasa Mandarin di Faktor Lain) artinya opsional? Dokumen klien tidak menjelaskan arti tanda *. | Ya. Item lain wajib dinilai sebelum memilih rekomendasi/keputusan. Tanda opsional disimpan per item di master, jadi bisa diubah HR kalau artinya berbeda |
| H9 | Pewawancara Interview HR | Default HR yang membuat interview, bisa diganti user lain |
| H10 | Interviewer User dibatasi hanya user dengan posisi SPV/Manager/Direktur? | Tidak dibatasi di backend (posisi belum punya level); frontend bisa memfilter. Posisi interviewer diambil dari data user |
| H11 | Bagaimana interviewer tahu ada interview yang harus diisi? | Endpoint "interview saya" (jadwal dan yang belum diisi milik user login). My Task berbasis posisi tidak dipakai, karena interviewer dipilih per orang |
| H12 | Ruangan interview offline | Teks bebas (belum ada master ruangan). Offline: ruangan wajib; Online: link wajib |
| H13 | Jadwal lama di kandidat (`hr_interview_*`, `user_interview_*`) | Disalin ke dokumen interview saat migrasi; kolom di kandidat tetap ada untuk data lama tapi tidak dipakai lagi |
| H14 | Interview HR dan Interview User tidak memakai approval lagi (hasil langsung dari tombol rekomendasi/keputusan)? | Ya. Approval flow `recruitment hr interview` dan `recruitment user interview` dinonaktifkan. Offering dan Contract tetap seperti sekarang sampai dokumennya ada |
| H15 | Field lama yang tidak ada di form baru: Interview HR `work_system`, `salary`; Interview User `recommended_salary`, `recommended_benefit`, `active_work_date` | Tetap ada dan opsional (dipakai sebagai default Offering), disembunyikan di form baru sampai dokumen Offering ada |
| H16 | Interview ulang: setelah No Show, apakah HR bisa menjadwalkan lagi? | Ya. Sebelum hasil diisi, jadwal bisa diubah (reschedule). Setelah No Show, HR bisa membuat Interview HR/User baru, dan hiring status kembali ke Interview HR / Interview User |
| H17 | Migrasi data lama: 3 Interview HR passed + approve dan 3 Interview User accepted + approve | Interview HR → hadir + Direkomendasikan; Interview User → satu interviewer (pembuat dokumen), hadir + Diterima; nilai laporan kosong; teks lama dipindah ke Deskripsi. Hiring status 9 kandidat diisi dari tahap terakhirnya |

## Implementasi fase H-A dan H-B

Dikerjakan 2026-11-24. Panduan endpoint: [recruitment-frontend.md](recruitment-frontend.md) bagian 2 ("Hiring status") dan 8. Test: `tests/recruitment.test.js`, `tests/recruitmentReportItem.test.js`.

**H-A**

- `recruitment_candidates.hiring_status` menjadi ENUM 15 nilai (NOT NULL, default `contacting`), plus `hiring_status_updated_at`, `birth_date`, `birth_place`, `address`.
- Kandidat baru selalu `contacting`. `hiring_status` **tidak lagi diterima** di create/edit kandidat (sebelumnya teks bebas, keputusan 16 di recruitment-requirement.md); diubah lewat `PATCH /api/recruitment/candidates/hiring-status/:id` atau otomatis dari interview (H-C/H-D).
- Helper `setCandidateHiringStatus` di `recruitment.service.js` dipakai bersama oleh perubahan manual dan (nanti) interview; setiap perubahan tercatat di riwayat kandidat.
- List kandidat membawa `recruitment_request.request_no` (kolom Request Number). Kolom ringkasan Interview HR / User di list ikut dibentuk ulang di H-C/H-D, karena jadwal pindah ke dokumen interview.
- Filter `hiring_status` sekarang nilai persis (sebelumnya pencarian sebagian teks).

**H-B**

- Tabel `recruitment_report_items` (section, group_name, group_description, item_name, item_description, is_optional, sort_order, is_active), satu daftar untuk Interview HR dan User (H7).
- Endpoint `/api/recruitment/report-items` (list, form terkelompok, tambah, ubah, nonaktifkan). Nama item unik per section + group di antara item aktif.
- Isi awal: 29 item dari "Laporan Interview HR" (Gaya Kerja 12 item dalam 3 kelompok; Pola Kerja 4 item opsional; Hasil Interview: Faktor Utama 11 item, Faktor Lain 2 item opsional). Teks uraian disalin dari dokumen klien apa adanya, kecuali salah ketik "bertigkah" → "bertingkah"; "sehubas" di Pengetahuan Teknis dibiarkan karena maksudnya tidak jelas (bisa diubah HR lewat master).

**Deploy H-A dan H-B — sudah dijalankan di DB1 dan DB2 (2026-11-24)**: 9 kandidat diisi (6 `contacting`, 3 `work contract`), 29 item master dibuat.

1. `npm run db:sync-recruitment-interview` (DB1 dan DB2): kolom baru kandidat; isi `hiring_status` 9 kandidat dari tahap terakhirnya (H17) dan catat di riwayatnya; ubah kolom menjadi ENUM; buat `recruitment_report_items` dan isi 29 item. **Wajib sebelum kode ini jalan**, karena model kandidat membaca kolom baru. Aman dijalankan ulang.

## Implementasi fase H-C (Interview HR baru)

Dikerjakan 2026-11-24. Panduan endpoint: [recruitment-frontend.md](recruitment-frontend.md) bagian 3. Test: `tests/recruitment.test.js`.

- `recruitment_hr_interviews`: kolom baru `interview_date`, `interview_time`, `method` (online/offline), `meeting_room`, `meeting_link`, `id_user_interviewer`, `attendance`, `recommendation`, `description`, `id_user_result`, `result_at`. Status baru `scheduled` → `no show` / `completed`; `pending`/`approve`/`reject` hanya untuk data lama. `decision`, `psychotest_result`, `interview_result` dipertahankan untuk data lama (boleh kosong).
- Tabel baru `recruitment_psychotests` (baris psikotes, file `files_result`) dan `recruitment_interview_scores` (nilai laporan per item dengan salinan nama; dipakai juga Interview User di H-D lewat `interview_type`).
- Buat: `POST /hr-interviews` (jadwal; offline wajib ruangan, online wajib link; pewawancara default pembuat) → hiring status `hr interview`. Edit jadwal hanya saat `scheduled`.
- Isi hasil: `PATCH /hr-interviews/result/:id`, sekali. Nilai dicek terhadap master aktif (item wajib harus dinilai). Hiring status: no show → `hr interview no show`, recommended → `user interview`, not recommended → `hr interview rejected`.
- Approval Interview HR dihapus: target `recruitment hr interview` dikeluarkan dari approval target, endpoint approve/reject Interview HR tidak ada lagi, flow-nya dinonaktifkan migrasi.
- Interview User sekarang mensyaratkan Interview HR `completed` + `recommended` (sebelumnya approve + passed). Interview User sendiri belum berubah (H-D).
- `RecruitmentDocumentService.prepare` sekarang juga menerima `userId` (untuk pewawancara default).

**Deploy H-C — sudah dijalankan di DB1 dan DB2 (2026-11-24)**: 3 Interview HR lama dipindah (`completed` + `recommended`), flow `recruitment hr interview` dinonaktifkan. Script sempat gagal di percobaan pertama karena urutan langkah (sebelum menulis apa pun), lalu diperbaiki.

1. `npm run db:sync-recruitment-interview` (langkah 4): kolom dan status baru Interview HR, tabel psikotes dan nilai laporan, pemindahan 3 Interview HR lama (approve + passed → `completed` + `recommended`, jadwal dari kandidat, teks lama → `description` / satu baris psikotes "Psikotes (data lama)"), dan nonaktif flow `recruitment hr interview`. **Wajib sebelum kode ini jalan.**

## Implementasi fase H-D (Interview User baru)

Dikerjakan 2026-11-24. Panduan endpoint: [recruitment-frontend.md](recruitment-frontend.md) bagian 4. Test: `tests/recruitment.test.js`.

- `recruitment_user_interviews`: kolom baru `result` (accepted / considered / not accepted), `consideration_due_date`, `result_at`; status baru `scheduled` → `no show` / `completed`; `decision`, `assessment` dipertahankan untuk data lama. `recommended_salary`, `recommended_benefit`, `active_work_date` tetap ada (opsional, H15).
- Tabel baru `recruitment_user_interviewers`: satu baris per interviewer dengan jadwal, `position_name` (dari posisi user), kehadiran (HR), keputusan dan deskripsi (interviewer). Nilai laporan memakai `recruitment_interview_scores` dengan `interview_type` `user`.
- Endpoint: buat/ubah jadwal (`POST`/`PUT /user-interviews` dengan `interviewers`), kehadiran (`PATCH /user-interviews/:id/interviewers/:interviewerId/attendance`), keputusan (`.../decision`), interview saya (`GET /user-interviews/my`).
- Hasil kandidat (H5) dihitung setelah semua interviewer hadir dan memutuskan; No Show di satu jadwal langsung mengakhiri. Pertimbangan 14 hari, penanda `needs_decision_reminder` mulai H-3 dan `is_consideration_overdue`; tidak ada perubahan otomatis setelah 14 hari (H6).
- Pengisian laporan dibatasi ke interviewer itu sendiri mengikuti `APPROVAL_ENFORCE` (sementara hanya dicatat di log).
- Approval Interview User dihapus: target `recruitment user interview` dikeluarkan, flow dinonaktifkan migrasi.
- Offering sekarang mensyaratkan Interview User `completed` + `result: accepted`. Karena form baru tidak berisi tanggal aktif/gaji/benefit, `effective_date` Offering perlu diisi di form Offering (sebelumnya default dari Interview User). Offering/Contract sendiri belum diubah (menunggu dokumen klien).
- `RecruitmentDocumentService` mendapat hook `decorate(row, isDetail)` (penanda reminder dan `hr_interview` di detail).

**Deploy H-D — sudah terpasang di DB1 dan DB2 (dicek 2026-11-24)**: kolom/status baru, tabel `recruitment_user_interviewers`, 3 Interview User lama dipindah (`completed` + `accepted`, satu interviewer = pembuatnya), flow `recruitment user interview` nonaktif. Saat script dijalankan, langkah ini sudah diterapkan sebelumnya, jadi tidak ada perubahan baru; hasilnya dicek langsung di database.

1. `npm run db:sync-recruitment-interview` (langkah 5): kolom dan status baru Interview User, tabel `recruitment_user_interviewers`, pemindahan 3 Interview User lama (approve + accepted → satu interviewer = pembuatnya, hadir + accepted, `completed` + `result: accepted`, jadwal dari kandidat, `assessment` → deskripsi interviewer), dan nonaktif flow `recruitment user interview`. **Wajib sebelum kode ini jalan.**
