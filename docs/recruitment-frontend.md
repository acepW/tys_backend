# Panduan Frontend: Recruitment

Semua endpoint berawalan `/api/recruitment` dan butuh login.

## Konsep singkat

Ada 6 modul. Selain Database Kandidat, semuanya dibuat dengan status `pending` (Pengajuan Kandidat: `request hr staff`), lalu di-**approve** atau di-**reject** (reject wajib `note`). Pengajuan Kandidat punya approval bertahap (lihat bagian 1). Approve/reject diatur lewat approval flow per modul; untuk sementara approver-nya posisi Developer.

**Database Kandidat tidak punya approval** (sejak 2026-11-18): kandidat langsung tersimpan, tanpa `status`, dan bisa langsung dipakai di Interview HR. ~~Kandidat dibuat `pending` dan harus di-approve lewat `recruitment candidate`.~~

| Modul              | Path               | `approval_for`               | Syarat create                                             |
| ------------------ | ------------------ | ---------------------------- | --------------------------------------------------------- |
| Pengajuan Kandidat | `/requests`        | `recruitment request`        | -                                                         |
| Database Kandidat  | `/candidates`      | - ~~`recruitment candidate`~~ | Request `approve` dan hiring `open`                       |
| Interview HR       | `/hr-interviews`   | `recruitment hr interview`   | Kandidat aktif ~~Kandidat `approve`~~                     |
| Interview User     | `/user-interviews` | `recruitment user interview` | Interview HR `approve` dengan `decision` = `passed`       |
| Offering Letter    | `/offerings`       | `recruitment offering`       | Interview User `approve` dengan `decision` = `accepted`   |
| Kontrak Kerja      | `/contracts`       | `recruitment contract`       | Offering Letter `approve`                                 |

Aturan step:

- Satu kandidat hanya boleh punya **satu** dokumen `pending`/`approve` per step. Kalau dokumen step di-reject, buat dokumen baru untuk step itu.
- Dokumen step hanya bisa diedit saat `pending`. Pengajuan hanya bisa diedit di tahap tertentu dan per field (lihat bagian 1). **Kandidat bisa diedit kapan saja**, termasuk untuk reschedule jadwal interview.
- Kontrak kerja yang di-approve **tidak** otomatis membuat data karyawan.

Status dokumen (`status`): `pending`, `approve`, `reject`. Pengajuan Kandidat memakai `request hr staff`, `request spv hr`, `request manager hr`, `request director`, `returned to requester`, `approve` (dan `reject` hanya di data lama). ~~`request spv/manager hr`~~ dipecah sejak 2026-11-18. Kandidat tidak punya `status`.

## Endpoint (sama untuk setiap modul)

| Aksi     | Method & endpoint              | Keterangan                                    |
| -------- | ------------------------------ | --------------------------------------------- |
| List     | `GET /{modul}`                 | Filter per modul lihat di bawah, `page`, `limit` |
| Detail   | `GET /{modul}/:id`             | Termasuk `verification_progress`              |
| Buat     | `POST /{modul}`                | Status `pending` (pengajuan: `request hr staff`; kandidat: tanpa status) |
| Edit     | `PUT /{modul}/:id`             | Kirim hanya field yang diubah                 |
| Approve  | `PATCH /{modul}/approve/:id`   | Body `{ "note": "opsional" }`. Tidak ada untuk `/candidates` |
| Reject   | `PATCH /{modul}/reject/:id`    | Body `{ "note": "wajib" }`; Pengajuan Kandidat juga `reject_to` (bagian 1). Tidak ada untuk `/candidates` |

List dan detail berisi `is_can_approve_reject` dan `action_label`, sama seperti fitur approval lain, kecuali Database Kandidat.

Dropdown kandidat di form step: `GET /candidates/options?stage=...`, `stage` = `hr interview`, `user interview`, `offering`, atau `contract`. Isinya hanya kandidat yang **boleh** masuk step tersebut (kandidat aktif, step sebelumnya approved sesuai syarat, dan belum punya dokumen aktif di step itu). Setiap kandidat berisi `job_title`, `position`, `department`, dan `previous_step` (dokumen step sebelumnya, untuk prefill form, mis. offering diisi dari interview user, kontrak dari offering).

File mengikuti format file lain (`original_name`, `stored_name`, `url`, `mime_type`, `size`); upload dulu ke folder `recruitment`. Saat edit, sertakan `id` file lama yang ingin dipertahankan.

## 1. Pengajuan Kandidat / Candidate Request (`/requests`)

```json
{
  "id_company": 1,
  "id_department": 3,
  "id_division": 1,
  "id_position": 2,
  "id_level": 1,
  "request_type": "replacement",
  "current_division_member": 4,
  "number_of_people": 2,
  "hiring_deadline": "2026-12-01",
  "hard_skill": "Microsoft Excel, SAP",
  "soft_skill": "Teliti, komunikatif",
  "other_requirement": "Pengalaman minimal 1 tahun di bidang gudang",
  "job_description": "Mengelola administrasi gudang",
  "salary_min": 5000000,
  "salary_max": 6500000,
  "reason": "Karyawan sebelumnya resign",
  "hiring_status": "open"
}
```

| Field                     | Wajib | Label di form             | Keterangan |
| ------------------------- | ----- | ------------------------- | ---------- |
| -                         | -     | Request Number            | `request_no`, dibuat backend saat create (lihat di bawah). Jangan dikirim |
| `id_company`              | Ya    | Company                   | Dari `GET /api/companies` |
| `id_department`           | Ya    | Department                | Dari `GET /api/departments` |
| `id_division`             | Ya    | Division                  | Dari `GET /api/divisions?id_department=` (sejak 2026-11-24 harus divisi milik department itu) |
| `id_position`             | Ya    | Position                  | Dari `GET /api/positions?id_department=&id_division=` (sejak 2026-11-24 harus cocok dengan department/divisi) |
| `id_level`                | Ya    | Level                     | Dari `GET /api/levels` (lihat bagian 7) |
| `request_type`            | Ya    | Type of Request           | `replacement` (Replacement) atau `additional member` (Additional) |
| `current_division_member` | Ya    | Current Division Member   | Bilangan bulat ≥ 0. Baru sejak 2026-11-18 |
| `number_of_people`        | Ya    | Required Number of People | Bilangan bulat > 0 |
| `hiring_deadline`         | Tidak | Hiring Deadline           | `YYYY-MM-DD` |
| `hard_skill`              | Tidak | Job Requirement: Hard Skill | Baru sejak 2026-11-18 |
| `soft_skill`              | Tidak | Job Requirement: Soft Skill | Baru sejak 2026-11-18 |
| `other_requirement`       | Tidak | Job Requirement: Others   | Baru sejak 2026-11-18 |
| ~~`job_requirement`~~     | -     | ~~Job Requirement~~       | **Dihapus 2026-11-18**: dipecah menjadi tiga field di atas dan tidak diterima lagi. Isi lama dipindah ke `other_requirement`; response request lama masih membawanya |
| `job_description`         | Tidak | Job Description           | |
| `salary_min`, `salary_max` | Tidak | Salary Range             | Angka ≥ 0, `salary_min` ≤ `salary_max`. Baru sejak 2026-11-18; biasanya diisi atau diubah SPV HR |
| `reason`                  | Tidak | Applicant's Reasons       | |
| `hiring_status`           | Tidak | Hiring Status             | `open` (default) atau `close` |

Field lama `job_title` (Jabatan teks) diganti `id_level` dan tidak diterima lagi. Request lama tetap menyimpan `job_title`-nya, dan `id_level`-nya kosong.

**Request Number** (`request_no`): `REC-{initial company}-{MM}-{YYYY}-{0001}`, misalnya `REC-TYS-11-2026-0001`. Urutannya per initial company dan mulai lagi dari 0001 setiap tahun. Nomor tidak berubah walaupun company diedit. Request lama diberi nomor oleh script migrasi; request lama yang tidak punya company tetap tanpa nomor.

Company, department, dan division masih dipilih manual; pengisian otomatis dari data pengaju masih didiskusikan dengan klien ([recruitment-requirement.md](recruitment-requirement.md), pertanyaan 1–3). Sejak 2026-11-24 department → division → position dipilih berantai dan backend menolak kombinasi yang tidak cocok (400), lihat [org-hierarchy-frontend.md](org-hierarchy-frontend.md). Saat update, kombinasi hanya dicek kalau salah satu dari ketiganya berubah.

Response list/detail membawa `request_no`, `company`, `department`, `division`, `position`, `level`, dan `revisions` (riwayat revisi). Filter list: `id_company`, `id_department`, `id_division`, `id_position`, `id_level`, `request_type`, `hiring_status`, `status`, `search` (job description).

### Alur approval

Tidak ada langkah submit terpisah: begitu dibuat, request langsung menunggu approval HR Staff.

```text
create → request hr staff → request spv hr → request manager hr → request director → approve
                 │                 │                  │                    │
                 └── reject ke Requestor, SPV HR, atau HR Staff (lihat tabel) ──► returned to requester ─resubmit─► request hr staff
```

~~`request hr staff` → `request spv/manager hr` → `request director` → `approve`; reject di tahap mana pun langsung `reject`.~~ *(Diubah 2026-11-18: SPV HR dan Manager HR dipisah, dan reject mengembalikan request.)*

| Status                  | Menunggu         | Yang bisa diedit                                                  | Reject ke (`reject_to`)        |
| ----------------------- | ---------------- | ----------------------------------------------------------------- | ------------------------------ |
| `request hr staff`      | HR Staff         | `hard_skill`, `soft_skill`, `other_requirement`, `job_description` | `requester`                    |
| `request spv hr`        | SPV HR           | `salary_min`, `salary_max`                                        | `hr staff`, `requester`        |
| `request manager hr`    | Manager HR       | Tidak ada                                                         | `spv hr`, `requester`          |
| `request director`      | Director         | Tidak ada                                                         | `spv hr`, `requester`          |
| `returned to requester` | Requester        | Semua field, hanya oleh requester                                 | - (requester submit ulang)     |
| `approve`               | Selesai          | Tidak (kecuali hiring status, lihat di bawah)                     | -                              |
| `reject`                | Selesai (data lama) | Tidak                                                          | -                              |

- Approve/reject di setiap tahap memakai endpoint yang sama: `PATCH /requests/approve/:id` dan `PATCH /requests/reject/:id`. Backend menentukan tahapnya dari status saat ini.
- Reject wajib `note` dan `reject_to` sesuai tabel. Di tahap HR Staff `reject_to` boleh dikosongkan karena pilihannya hanya `requester`. Tampilkan pilihan reject sesuai status, misalnya di Manager HR: **Reject ke SPV HR** (ubah Salary Range) dan **Reject ke Requestor**.

```json
{ "note": "Salary range melebihi budget divisi", "reject_to": "spv hr" }
```

- Request yang di-reject ke SPV HR naik lagi lewat Manager HR → Director. Request yang di-reject ke HR Staff naik lagi lewat SPV HR.
- **Divisi HR:** jika user pembuat request berada di divisi HR, request langsung dibuat dengan status `request spv hr` (melewati HR Staff), dan submit ulang juga kembali ke `request spv hr`. Divisi HR dikenali dari `division_code` yang mengandung `HR` atau `division_name` yang mengandung `Human Resource` / kata `HR`, misalnya `HR`, `HRD`, `HRGA`, `Human Resources`.
- Tampilkan tombol approve/reject berdasarkan `is_can_approve_reject`. `action_label` menyebut tahapnya, misalnya `Approve / Reject Recruitment Request by SPV HR`.

### Dikembalikan ke requester

Saat `status === "returned to requester"`, tampilkan alasan dari riwayat reject terakhir (`verification_progress` berstatus `reject ... to requester`). Hanya requester (`id_user_request` sama dengan user login) yang bisa mengedit semua field dan submit ulang:

```http
PATCH /api/recruitment/requests/resubmit/:id
```

```json
{ "note": "Sudah diperbaiki (opsional)" }
```

Hasil: kembali ke `request hr staff` (atau `request spv hr` untuk divisi HR). Tombol ini tidak memakai `is_can_approve_reject`; tampilkan berdasarkan `status` dan `id_user_request`.

### Revisi

Form bisa diubah lewat `PUT /requests/:id` (kirim field yang diubah) hanya pada status dan field di tabel alur approval. ~~Selama proses approval, form bisa diubah oleh siapa pun untuk semua field.~~ *(Diubah 2026-11-18.)*

- Di tahap HR Staff dan SPV HR, user dicek terhadap approval flow tahap itu, sama seperti approve/reject.
- Field lain yang ikut terkirim dengan nilai **sama** diabaikan, jadi form lengkap boleh dikirim. Field lain yang nilainya **berubah** ditolak (400).

**Setiap update dicatat sebagai revisi** (before/after): field yang nilainya benar-benar berubah masuk ke `revisions`, dan `verification_progress` mencatat `revised`.

```json
"revisions": [
  { "revision_no": 1, "field": "hard_skill", "old_value": "Excel", "new_value": "Excel, SAP", "createdAt": "...", "user": { "id": 7, "name": "HR Staff" } },
  { "revision_no": 2, "field": "salary_min", "old_value": null, "new_value": "5000000", "createdAt": "...", "user": { "id": 8, "name": "SPV HR" } }
]
```

- Field yang diubah dalam satu kali simpan punya `revision_no` yang sama. Kelompokkan berdasarkan `revision_no` untuk menampilkan histori per revisi.
- `old_value` / `new_value` disimpan sebagai teks. Untuk field `id_*`, isinya ID master; tampilkan namanya dengan mencocokkan ke data master.
- `verification_progress` juga mencatat `revised` dengan note berisi daftar field yang diubah, misalnya `Recruitment request revised: hard_skill, job_description`.

### Open / close hiring

Setelah request `approve`, hiring bisa ditutup atau dibuka lagi:

```http
PATCH /api/recruitment/requests/hiring-status/:id
```

```json
{ "hiring_status": "close", "note": "Posisi sudah terisi (opsional)" }
```

Hanya untuk request berstatus `approve`. Tercatat di `verification_progress` sebagai `hiring close` / `hiring open`.

## 2. Database Kandidat (`/candidates`)

Kandidat **langsung tersimpan tanpa pengajuan atau approval** (sejak 2026-11-18). Tidak ada `status`, endpoint approve/reject, `is_can_approve_reject`, atau tugas My Task untuk kandidat. Kandidat yang tersimpan bisa langsung dibuatkan Interview HR. User yang menyimpan kandidat adalah **HR PIC** (`user_request`).

```json
{
  "id_recruitment_request": 5,
  "name": "Budi Santoso",
  "source": "JobStreet",
  "phone_number": "0812-3456-7890",
  "email": "budi@example.com",
  "files_cv": [
    { "original_name": "cv-budi.pdf", "stored_name": "1763400000000-cv-budi.pdf", "url": "/files/recruitment/1763400000000-cv-budi.pdf", "mime_type": "application/pdf", "size": 120000 }
  ],
  "has_professional_license": true,
  "license_type": "other",
  "license_type_other": "Ahli gizi",
  "job_title": "Staff",
  "disc": "Dominan - Influence",
  "recruitment_process": "Screening CV",
  "hr_interview_mechanism": "Online",
  "hr_interview_date": "2026-10-21",
  "hr_interview_time": "09:00",
  "hr_interview_meeting_room": "Ruang Meeting 2",
  "hr_interview_meeting_room_link": "https://meet.google.com/abc-defg-hij",
  "user_interview_mechanism": "Onsite",
  "user_interview_date": "2026-10-25",
  "user_interview_time": "13:30",
  "files_application_form": []
}
```

**Wajib saat create:** `id_recruitment_request`, `name`, `files_cv` (minimal 1 file), dan `has_professional_license`. Field lain opsional. Tanggal `YYYY-MM-DD`, jam `HH:MM`, `email` harus format email yang valid.

**Form New Candidate**

| Field                      | Wajib | Label di form | Keterangan |
| -------------------------- | ----- | ------------- | ---------- |
| `id_recruitment_request`   | Ya    | (pilih request) | Company, Departemen, Divisi, Level, Position tampil read-only dari request |
| -                          | -     | HR PIC        | `user_request.name`, terisi otomatis |
| `name`                     | Ya    | Candidate Name | |
| `source`                   | Tidak | Source        | |
| `phone_number`             | Tidak | Phone Number  | |
| `email`                    | Tidak | Email         | |
| `files_cv`                 | Ya    | CV            | Minimal 1 file. Saat edit tidak boleh dikirim kosong (`[]`); kalau tidak dikirim, file lama tetap |
| `has_professional_license` | Ya    | Professional Certification/License to Be Used by the Company | `true` (Yes) / `false` (No) |
| `license_type`             | Ya, kalau Yes | Certification/License Type | Satu pilihan dari tabel di bawah. Kalau No, dikosongkan backend |
| `license_type_other`       | Ya, kalau `other` | Other (free text) | Dikosongkan backend kalau `license_type` bukan `other` |
| ~~`hiring_status`~~        | -     | Hiring Status | ~~Teks bebas, diisi dan diubah HR kapan saja.~~ **Sejak 2026-11-24 tidak diterima di create/edit** (diabaikan). Kandidat baru otomatis `contacting`; ubah lewat `PATCH /candidates/hiring-status/:id` (lihat "Hiring status" di bawah). Berbeda dengan `recruitment_request.hiring_status` (open/close milik request) |
| `birth_date`, `birth_place`, `address` | Tidak | Birth Date, Birth Place, Address | Baru 2026-11-24. Opsional, bisa diisi setelah Interview HR. `birth_date` format `YYYY-MM-DD` |

| `license_type`                       | Label |
| ------------------------------------ | ----- |
| `pharmacist`                         | Pharmacist (STRA/SIPA) |
| `healthcare professional`            | Other healthcare professional (doctor, nurse, etc.) |
| `occupational safety expert`         | Occupational Safety (K3) Expert |
| `construction engineering expert`    | Construction/Engineering Expert (SKK, STRI) |
| `accountant auditor tax consultant`  | Accountant / Auditor / Tax Consultant |
| `lead auditor`                       | Lead auditor certification (ISO, etc.) |
| `other`                              | Other (free text) |

Kandidat lama belum punya jawaban lisensi (`has_professional_license` `null`) dan tetap bisa diedit tanpa mengisinya. Untuk mengisi `license_type`, kirim juga `has_professional_license`.

Field di luar Form New Candidate (`job_title`, `disc`, `recruitment_process`, jadwal interview, `files_application_form`) tetap ada dan diisi lewat edit.

**Pilih recruitment request**

- Dropdown request di form kandidat: `GET /api/recruitment/requests?status=approve&hiring_status=open`. Hanya request yang sudah `approve` **dan** hiring-nya `open` yang bisa dipilih. Selain itu, create ditolak (`Recruitment request is ... not approved yet` / `Recruitment request hiring is closed`).
- `id_company`, `id_department`, `id_division`, `id_position`, dan `id_level` kandidat **diambil otomatis dari request** yang dipilih. Field ini tidak perlu dikirim; kalau dikirim, nilainya diabaikan. Tampilkan di form sebagai field read-only dari data request.
- Saat edit, kalau `id_recruitment_request` diganti ke request lain (yang juga harus approve dan open), kelima field itu ikut diperbarui dari request baru.
- Kandidat lama (dibuat sebelum fitur ini) belum punya request. Hubungkan dengan mengisi `id_recruitment_request` lewat edit.

| Field baru                       | Label di form                  |
| -------------------------------- | ------------------------------ |
| `phone_number`                   | Phone Number                   |
| `email`                          | Email                          |
| `hr_interview_meeting_room`      | HR Interview Meeting Room      |
| `hr_interview_meeting_room_link` | HR Interview Meeting Room Link |

Response list/detail berisi `recruitment_request` (`id`, `request_no` (sejak 2026-11-24, untuk kolom Request Number), `status`, `hiring_status`, `number_of_people`, `hiring_deadline`, `request_type`), `company`, `department`, `division`, `position`, `level`, dan `user_request` (HR PIC). Kandidat tidak punya `status` lagi.

Filter list: `id_recruitment_request`, `id_company`, `id_department`, `id_division`, `id_position`, `id_level`, `has_professional_license`, `license_type`, `hiring_status` (nilai persis, sejak 2026-11-24), `name`, `job_title` (dua terakhir mencari sebagian teks). ~~`status`~~ dihapus 2026-11-18.

### Hiring status (sejak 2026-11-24)

`hiring_status` kandidat sekarang salah satu dari 15 nilai, dan `hiring_status_updated_at` mencatat kapan terakhir berubah. Kandidat baru selalu `contacting`. Nilai 1–10 nanti juga berubah otomatis dari Interview HR dan Interview User (fase H-C/H-D); 11–15 diubah manual sampai dokumen Offering/Contract ada. Daftar lengkap dan aturannya: [recruitment-interview-requirement.md](recruitment-interview-requirement.md) bagian 2.

| `hiring_status` | Label |
| --- | --- |
| `contacting` | Menghubungi |
| `no response` | No Respond |
| `hr interview` | Interview HR |
| `hr interview no show` | No Show (HR Interviews) |
| `hr interview rejected` | Ditolak (HR Interviews) |
| `user interview` | Interview User |
| `user interview no show` | No Show (User Interviews) |
| `user interview rejected` | Ditolak (User Interviews) |
| `user interview consideration` | Pertimbangan (User Interviews) |
| `offering letter` | Offering Letter |
| `rejected by candidate` | Ditolak oleh kandidat |
| `negotiation` | Negosiasi |
| `work contract` | Work Contract |
| `onboarding` | Onboarding |
| `contract no show` | No Show (kontrak) |

Ubah manual (HR, ke nilai mana pun termasuk mundur):

```http
PATCH /api/recruitment/candidates/hiring-status/:id
```

```json
{ "hiring_status": "no response", "note": "Tidak mengangkat telepon (opsional)" }
```

Nilai di luar daftar ditolak 400; nilai yang sama dengan sekarang ditolak 409. Setiap perubahan (manual maupun otomatis) tercatat di `verification_progress` kandidat dengan status `hiring status <nilai>` dan catatan `<lama> → <baru>`. Response: detail kandidat.

Response list/detail kandidat sudah membawa data step lain: `hr_interviews`, `user_interviews`, `offerings`, `contracts`, masing-masing **urut terbaru dulu** (pakai index `0`).

Pemetaan kolom tabel Database Kandidat:

| Kolom tabel                               | Field                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Name, Jabatan, Posisi, Department, Sumber | `name`, `job_title`, `position.position_name`, `department.department_name`, `source` |
| Dibuat oleh (HR PIC)                      | `user_request.name` (user yang membuat kandidat) |
| CV, Application Form                      | `files_cv`, `files_application_form`                                         |
| DISC, Proses Rec                          | `disc`, `recruitment_process`                                                |
| Interview HR: Tanggal & Jam, Offline/Online, PIC HR, Status | `hr_interviews[0].interview_date` + `interview_time`, `hr_interviews[0].method`, `hr_interviews[0].user_request.name` (PIC; pewawancara: `interviewer.name`), `hr_interviews[0].status` + `recommendation` (sejak 2026-11-24). ~~`hr_interview_mechanism`, `hr_interview_date`, `hr_interview_time`~~ di kandidat hanya data lama |
| Interview HR: Hasil, Catatan              | `hr_interviews[0].recommendation`, `hr_interviews[0].description` (~~`decision`, `interview_result`~~ sejak 2026-11-24) |
| Interview User: Tanggal & Jam, Offline/Online, PIC User, Status | Per interviewer `user_interviews[0].interviewers[]`: `interview_date` + `interview_time`, `method`, `user.name` (PIC User), `attendance` / `decision`; status gabungan `user_interviews[0].status` + `result` (sejak 2026-11-24). ~~`user_interview_mechanism`, `user_interview_date`, `user_interview_time`~~ di kandidat hanya data lama |
| Interview User: Hasil, Catatan            | `user_interviews[0].result`, `interviewers[].description` (~~`decision`, `assessment`~~ sejak 2026-11-24) |
| Offering: Tanggal, Dokumen, KTP, NPWP     | `offerings[0].offering_date`, `offerings[0].files_offering_letter`, `files_ktp`, `files_npwp` |
| Tanggal Mulai Kerja                       | `offerings[0].effective_date`                                                |

Mengubah `name` kandidat ikut mengubah `candidate_name` di semua step-nya.

**Pembuat kandidat** (`user_request`: `id`, `name`, `email`) ikut di setiap tempat data kandidat muncul: list/detail kandidat, `candidate` di detail Interview HR/User, Offering, dan Contract, `GET /candidates/options`, dan `user_interview.candidate` di "interview saya" (sejak 2026-11-24 juga di tiga tempat terakhir).

## 3. Interview HR (`/hr-interviews`, diubah 2026-11-24)

**Sejak 2026-11-24 Interview HR tidak memakai approval.** Alurnya dua langkah: HR **membuat** (menjadwalkan) interview, lalu setelah interview **mengisi hasilnya**. Endpoint `PATCH /hr-interviews/approve/:id` dan `/reject/:id` sudah dihapus. Rancangan: [recruitment-interview-requirement.md](recruitment-interview-requirement.md) bagian 3.

| `status` | Arti | Aksi |
| --- | --- | --- |
| `scheduled` | Sudah dijadwalkan, menunggu hasil | Edit jadwal (`PUT`), Isi Hasil |
| `no show` | Kandidat tidak datang | Buat Interview HR baru (H16) |
| `completed` | Hasil sudah diisi (`recommendation`) | Tidak ada |
| `pending` / `approve` / `reject` | Hanya data lama sebelum 2026-11-24 (sudah dipindah migrasi) | - |

### 3a. Buat / jadwalkan (HR)

`POST /api/recruitment/hr-interviews`

```json
{
  "id_recruitment_candidate": 1,
  "interview_date": "2026-11-25",
  "interview_time": "09:00",
  "method": "offline",
  "meeting_room": "Ruang Meeting 2",
  "meeting_link": null,
  "id_user_interviewer": 12
}
```

| Field | Wajib | Label | Keterangan |
| --- | --- | --- | --- |
| `id_recruitment_candidate` | Ya | Kandidat | Hanya saat create. Dropdown: `GET /candidates/options?stage=hr interview` |
| `interview_date`, `interview_time` | Ya | Date & Time | `YYYY-MM-DD`, `HH:MM` |
| `method` | Ya | Method | `online` / `offline` |
| `meeting_room` | Kalau `offline` | Interview Room | Teks bebas; dikosongkan backend kalau `online` |
| `meeting_link` | Kalau `online` | Link | Dikosongkan backend kalau `offline` |
| `id_user_interviewer` | Tidak | Pewawancara | Default HR yang membuat (H9); boleh user lain |

- Bagian 1 (Recruitment Request: Company, Departemen, Divisi, Level, Position, PIC) dan Bagian 2 (Candidate Information: nama, tanggal/tempat lahir, alamat, source, phone, email, CV, application form, nomor request) tampil read-only dari `candidate` di response (sudah membawa `recruitment_request`, `company`, `department`, `division`, `position`, `level`, `user_request` = PIC, `files_cv`, `files_application_form`). Tanggal/tempat lahir, alamat, dan upload CV tambahan diisi lewat `PUT /candidates/:id`.
- Membuat Interview HR mengubah hiring status kandidat menjadi `hr interview` (H3).
- Satu kandidat hanya boleh punya satu Interview HR yang `scheduled` atau `completed`; setelah `no show` boleh dibuat lagi.
- Selama `scheduled`, jadwal bisa diubah lewat `PUT /api/recruitment/hr-interviews/:id` (field yang sama, tanpa `id_recruitment_candidate`).
- Field lama `work_system` dan `salary` masih diterima (opsional, untuk default Offering, H15). ~~`psychotest_result`, `interview_result`, `decision`~~ tidak diterima lagi sejak 2026-11-24 (data lama dipindah ke `psychotests`, `description`, `recommendation`). ~~Jadwal Interview User (`user_interview_*`) di form ini~~ dihapus; jadwal Interview User ikut fase H-D.

### 3b. Isi hasil (HR Staff, setelah interview)

`PATCH /api/recruitment/hr-interviews/result/:id` — hanya saat `scheduled`, sekali.

```json
{
  "attendance": "attended",
  "psychotests": [
    { "tool_name": "DISC", "description": "Dominan, cepat mengambil keputusan", "files_result": [] }
  ],
  "scores": [
    { "id_report_item": 1, "score": "B" },
    { "id_report_item": 28, "score": null }
  ],
  "description": "Komunikatif, cocok dengan tim",
  "recommendation": "recommended"
}
```

| Field | Wajib | Label | Keterangan |
| --- | --- | --- | --- |
| `attendance` | Ya | Status Kehadiran | `attended` (Datang) / `no show`. Kalau `no show`, field lain diabaikan |
| `psychotests` | Tidak | Hasil Psikotes (tabel, bisa tambah baris) | `tool_name` (Nama Alat Tes) wajib per baris, `description`, `files_result` (array file) |
| `scores` | Ya, kalau hadir | Laporan Interview HR | Satu baris per item master (`GET /report-items/form`): `score` `KS`/`K`/`C`/`B`/`BS`. Item wajib harus dinilai; item opsional (`is_optional`) boleh `null` atau tidak dikirim |
| `description` | Tidak | Deskripsi | |
| `recommendation` | Ya, kalau hadir | Keputusan | `recommended` (Direkomendasikan) / `not recommended` (Tidak direkomendasikan) |

Hasilnya mengubah hiring status kandidat:

| Hasil | `status` interview | `hiring_status` kandidat |
| --- | --- | --- |
| `no show` | `no show` | `hr interview no show` |
| `recommended` | `completed` | `user interview` (H4) |
| `not recommended` | `completed` | `hr interview rejected` |

Detail (`GET /hr-interviews/:id`) membawa `interviewer`, `user_result`, `result_at`, `psychotests` (dengan `files_result`), dan `scores` (salinan `section`, `group_name`, `item_name`, `is_optional`, `score`, urut `sort_order`), sehingga laporan bisa ditampilkan persis seperti saat diisi walau master berubah.

Filter list: `id_recruitment_candidate`, `status`, `attendance`, `recommendation`, `id_user_interviewer`, `search` (nama kandidat). ~~`decision`~~ tidak dipakai untuk Interview HR lagi.

Interview User baru bisa dibuat untuk kandidat yang Interview HR-nya `completed` + `recommended` (sebelumnya: approve + passed).

## 4. Interview User (`/user-interviews`, diubah 2026-11-24)

**Sejak 2026-11-24 Interview User tidak memakai approval** dan bisa punya **beberapa interviewer**, masing-masing dengan jadwalnya sendiri. HR menjadwalkan, HR mengisi kehadiran per interviewer, lalu setiap interviewer mengisi laporan dan keputusannya. Endpoint `PATCH /user-interviews/approve/:id` dan `/reject/:id` sudah dihapus. Rancangan: [recruitment-interview-requirement.md](recruitment-interview-requirement.md) bagian 4.

| `status` | `result` | Arti |
| --- | --- | --- |
| `scheduled` | - | Menunggu kehadiran dan keputusan semua interviewer. Jadwal bisa diubah |
| `no show` | - | Kandidat tidak datang di salah satu jadwal; selesai. HR bisa membuat Interview User baru |
| `completed` | `accepted` | Semua interviewer Diterima |
| `completed` | `considered` | Ada yang Dipertimbangkan (tidak ada yang Tidak Diterima); dipertahankan sampai `consideration_due_date` (14 hari) |
| `completed` | `not accepted` | Ada yang Tidak Diterima |
| `pending` / `approve` / `reject` | - | Hanya data lama (sudah dipindah migrasi) |

### 4a. Buat / jadwalkan (HR)

`POST /api/recruitment/user-interviews`

```json
{
  "id_recruitment_candidate": 1,
  "interviewers": [
    { "id_user": 7, "interview_date": "2026-11-28", "interview_time": "10:00", "method": "online", "meeting_link": "https://meet.google.com/xyz" },
    { "id_user": 9, "interview_date": "2026-11-29", "interview_time": "13:00", "method": "offline", "meeting_room": "Ruang Direksi" }
  ]
}
```

- `interviewers` wajib, minimal 1 (User #1, #2, ...). Per baris: `id_user` (User Name; satu user sekali), `interview_date`, `interview_time`, `method`, `meeting_room` (offline) / `meeting_link` (online). Position tampil otomatis: `interviewers[].position_name` diambil dari posisi user saat dijadwalkan. Backend tidak membatasi posisi user (H10); filter ke SPV/Manager/Direktur di frontend.
- Dropdown kandidat: `GET /candidates/options?stage=user interview` (yang Interview HR-nya Direkomendasikan).
- Membuat Interview User mengubah hiring status menjadi `user interview` (juga setelah No Show).
- **Ubah jadwal** (selama `scheduled`): `PUT /api/recruitment/user-interviews/:id` dengan `interviewers` lengkap. Baris dengan `id` diubah, tanpa `id` ditambah, yang tidak dikirim dihapus. Interviewer yang kehadirannya sudah diisi tidak bisa diubah/dihapus (kirim ulang apa adanya).
- `recommended_salary`, `recommended_benefit`, `active_work_date` masih diterima (opsional, untuk default Offering, H15) tapi tidak ada di form klien. ~~`assessment`, `decision`~~ tidak diterima lagi.

### 4b. Kehadiran (HR, per interviewer)

`PATCH /api/recruitment/user-interviews/:id/interviewers/:interviewerId/attendance`

```json
{ "attendance": "attended" }
```

`attended` (Datang) / `no show`. Sekali per interviewer. **No show** di salah satu jadwal langsung mengakhiri Interview User (`status: "no show"`) dan hiring status kandidat menjadi `user interview no show`.

### 4c. Laporan dan keputusan (interviewer)

`PATCH /api/recruitment/user-interviews/:id/interviewers/:interviewerId/decision`

```json
{
  "scores": [{ "id_report_item": 1, "score": "B" }],
  "description": "Pemahaman teknis baik",
  "decision": "accepted"
}
```

- Hanya setelah HR mengisi kehadiran `attended`. Form laporan sama dengan Interview HR (`GET /report-items/form`); item wajib harus dinilai.
- `decision`: `accepted` (Diterima), `considered` (Dipertimbangkan), `not accepted` (Tidak Diterima).
- Hanya interviewer itu sendiri yang boleh mengisi (403 kalau `APPROVAL_ENFORCE=true`; sementara hanya dicatat di log).
- Setelah **semua** interviewer hadir dan memutuskan, hasil kandidat dihitung (H5):

| Keputusan interviewer | `result` | `hiring_status` kandidat |
| --- | --- | --- |
| Ada `not accepted` | `not accepted` | `user interview rejected` |
| Tidak ada `not accepted`, ada `considered` | `considered` | `user interview consideration` |
| Semua `accepted` | `accepted` | `offering letter` |

- **Pertimbangan** (H6): `consideration_due_date` = 14 hari sejak hasil `considered`. Interviewer yang memilih `considered` boleh mengirim ulang endpoint yang sama dengan `accepted` / `not accepted` (cukup `{ "decision": "accepted" }`; laporan tetap yang pertama), lalu hasil dihitung ulang. Setelah lewat 14 hari status **tidak** berubah otomatis.
- Response list/detail membawa `needs_decision_reminder` (`true` mulai 3 hari sebelum `consideration_due_date`) dan `is_consideration_overdue`. Sistem belum punya notifikasi/email, jadi tampilkan sebagai penanda.

### 4d. Interview saya (interviewer)

`GET /api/recruitment/user-interviews/my?pending=true`

Baris interviewer milik user login (terbaru dulu), masing-masing dengan `user_interview` (`status`, `result`, `consideration_due_date`, `candidate`) dan penanda: `waits_for_attendance` (menunggu HR), `needs_report` (isi laporan + keputusan), `needs_final_decision` (ubah Dipertimbangkan menjadi keputusan akhir), `needs_decision_reminder`, `is_consideration_overdue`. `pending=true` hanya menampilkan yang masih menunggu sesuatu.

### 4e. Detail

`GET /user-interviews/:id` membawa `candidate` (Bagian 1 dan 2), `interviewers` (dengan `user`, `user_attendance`, `scores`, `decision`, `description`), dan `hr_interview`: Interview HR terakhir yang Direkomendasikan, untuk Bagian 2 "Hasil Psikotes" (`psychotests` + `files_result`) dan "Laporan Interview HR" (`description` + `scores`, bisa dibuka sebagai detail).

Filter list: `id_recruitment_candidate`, `status`, `result`, `search` (nama kandidat). ~~`decision`~~ tidak dipakai lagi.

## 5. Offering Letter (`/offerings`)

```json
{
  "id_recruitment_candidate": 1,
  "offering_date": "2026-10-28",
  "birth_place": "Bandung",
  "birth_date": "2000-01-15",
  "address": "Jl. Merdeka 1, Bandung",
  "effective_date": "2026-11-02",
  "salary": 6000000,
  "benefit": "BPJS, tunjangan transport",
  "files_offering_letter": [],
  "files_ktp": [],
  "files_npwp": []
}
```

Jika tidak dikirim saat create, nilai default-nya: `job_title` dan `id_department` dari kandidat; `effective_date`, `salary`, `benefit` dari interview user (tanggal aktif kerja, rekomendasi gaji, rekomendasi benefit); `offering_date` hari ini. `effective_date` wajib ~~(terisi otomatis dari interview user)~~. **Sejak 2026-11-24** form Interview User baru tidak berisi tanggal aktif, gaji, dan benefit, jadi `effective_date` (dan biasanya `salary`, `benefit`) perlu diisi di form Offering. Offering bisa dibuat untuk kandidat yang Interview User-nya `completed` + `result: "accepted"` (sebelumnya approve + accepted). Filter list: `id_recruitment_candidate`, `status`, `search`.

## 6. Kontrak Kerja (`/contracts`)

```json
{
  "id_recruitment_candidate": 1,
  "contract_date": "2026-10-30",
  "gender": "Male",
  "nik": "3201xxxxxxxxxxxx",
  "id_employee_supervisor": 4,
  "contract_type": "PKWT",
  "contract_duration": "12 bulan",
  "end_date": "2027-11-01"
}
```

Jika tidak dikirim saat create, nilai default-nya: nama dari kandidat; `birth_place`, `birth_date`, `address`, `job_title`, `id_department`, `salary` dari offering letter yang approved; `contract_date` hari ini. `id_employee_supervisor` (Bertanggung jawab kepada) adalah `id` karyawan; ambil daftarnya dari `GET /api/employees`. Filter list: `id_recruitment_candidate`, `status`, `search`.

## Verification progress

`verification_progress` di detail berisi `created`, `edited`, `approve`, dan `reject` (dengan `note`). Kandidat hanya punya `created` dan `edited` (kandidat lama bisa masih punya `approve` / `reject` dari sebelum approval dihapus; tampilkan apa adanya).

Untuk Pengajuan Kandidat, approve/reject menyebut tahapnya:

- Approve: `approve hr staff`, `approve spv hr`, `approve manager hr`, `approve director`.
- Reject menyebut tujuannya: `reject hr staff to requester`, `reject spv hr to hr staff`, `reject spv hr to requester`, `reject manager hr to spv hr`, `reject manager hr to requester`, `reject director to spv hr`, `reject director to requester`.
- `resubmitted` (requester submit ulang), `revised` (setiap edit pengajuan), `hiring close` / `hiring open`.
- Data lama bisa masih punya `approve spv/manager hr`, `reject hr staff`, `reject spv/manager hr`, `reject director`.

## 7. Master Level (`/api/levels`)

Master baru untuk field Level, polanya sama seperti master department/division:

| Aksi   | Endpoint                 | Body                                  |
| ------ | ------------------------ | ------------------------------------- |
| List   | `GET /api/levels`        | Hanya yang aktif, urut nama           |
| Detail | `GET /api/levels/:id`    |                                       |
| Buat   | `POST /api/levels`       | `{ "level_name": "Supervisor" }`      |
| Edit   | `PUT /api/levels/:id`    | `{ "level_name": "...", "is_active": true }` |
| Hapus  | `DELETE /api/levels/:id` | Soft delete (`is_active` = false)     |

`level_name` wajib dan tidak boleh sama dengan level lain (`Level already exists`). Position tetap memakai master `GET /api/positions` yang sudah ada.

## Pesan error yang perlu ditangani

| HTTP | Pesan                                                                  | Kapan                                      |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------ |
| 400  | `<field> is required`, `<field> must use YYYY-MM-DD format`, `<field> must use HH:MM format`, `decision must be one of: ...` | Validasi form |
| 400  | `active_work_date is required when accepted`                           | Interview user diterima tanpa tanggal aktif |
| 400  | `note is required for rejection`                                       | Reject tanpa note                          |
| 404  | `Recruitment candidate not found`, `<Modul> not found`                 | ID salah                                   |
| ~~409~~ | ~~`Recruitment candidate has not been approved yet`~~               | **Dihapus 2026-11-18**: kandidat tidak perlu approval |
| 409  | `Candidate needs ... first`                                            | Step sebelumnya belum approved / tidak lolos |
| 409  | `Candidate already has a pending/approve <step>`                       | Step sudah punya dokumen aktif             |
| 409  | `<Modul> cannot be edited while it is ...`, `<Modul> is already ...`   | Edit/approve dokumen yang sudah diproses   |
| 400  | `number_of_people must be a positive integer`, `request_type must be one of: ...`, `hiring_status must be one of: open, close` | Validasi form Pengajuan Kandidat |
| 409  | `Hiring status can only be changed on an approved request, not ...`, `Hiring is already ...` | Open/close hiring di status yang salah |
| 400  | `current_division_member must be a whole number of 0 or more`, `salary_min must be a non-negative number`, `salary_min cannot be more than salary_max` | Validasi form Pengajuan Kandidat |
| 404  | `Company not found`; 400 `The company has no initial for the request number` | Company pengajuan tidak ada / belum punya initial |
| 400  | `reject_to must be one of: ...`                                        | Reject pengajuan dengan tujuan yang tidak sesuai tahap |
| 400  | `Only ... can be edited while the request is ... (changed: ...)`       | Edit field di luar hak tahap itu           |
| 403  | `Only the requester can edit a request returned to them`, `Only the requester can resubmit the request` | Edit/submit ulang oleh selain requester |
| 409  | `Only a request returned to the requester can be resubmitted, not ...` | Submit ulang di status yang salah          |
| 400  | `files_cv must be a non-empty array`, `files_cv cannot be emptied: a candidate needs a CV` | Kandidat tanpa CV            |
| 400  | `has_professional_license must be true or false`, `license_type must be one of: ...`, `license_type_other is required when license_type is other`, `has_professional_license is required to set a license type` | Validasi lisensi kandidat |
| 404  | `Recruitment candidate has no approval`                                | (Hanya dari service; route approve/reject kandidat sudah tidak ada, jadi 404) |

## Setup

- Migrasi (sekali per environment): `npm run db:sync-recruitment`. Script ini juga membuat tabel `levels` dan `recruitment_request_revisions`, mengganti nama kolom `job_recruitment` menjadi `job_requirement`, menambah kolom baru Pengajuan Kandidat, dan mengganti status pengajuan `pending` menjadi `request hr staff` (termasuk baris approval flow-nya) serta menambah `request spv/manager hr` / `request director`, lalu menambah kolom baru kandidat (`id_recruitment_request`, `id_company`, `id_division`, `id_level`, `phone_number`, `email`, `hr_interview_meeting_room`, `hr_interview_meeting_room_link`). Aman dijalankan ulang. Jalankan **sebelum** `db:setup-approval-flows` supaya flow `request hr staff` tidak dobel.
- Approval flow: `npm run db:setup-approval-flows [nama_posisi]` membuat flow untuk setiap status yang belum punya flow, termasuk `request spv/manager hr` dan `request director` milik `recruitment request`. Setelah itu atur posisi HR Staff, SPV/Manager HR, dan Director lewat `/api/approval-flows`. Selama `APPROVAL_ENFORCE` belum `true`, approve/reject oleh siapa pun tetap berhasil.
- **2026-11-18** (jalankan lagi, urutannya sama): `npm run db:sync-recruitment` lalu `npm run db:setup-approval-flows`.
  - `db:sync-recruitment` menambah kolom pengajuan (`request_no`, `current_division_member`, `hard_skill`, `soft_skill`, `other_requirement`, `salary_min`, `salary_max`) dan menyalin `job_requirement` lama ke `other_requirement`.
  - Status `request spv/manager hr` (pengajuan dan flow-nya) diganti `request spv hr`; `request manager hr` dan `returned to requester` ditambahkan.
  - Pengajuan lama yang punya company diberi `request_no`.
  - Kolom `status` kandidat dihapus, flow `recruitment candidate` dinonaktifkan, dan kolom lisensi kandidat ditambahkan.
  - `db:setup-approval-flows` membuat flow `request manager hr` yang baru. Atur posisi SPV HR (flow `request spv hr`, dulu SPV/Manager HR) dan Manager HR lewat `/api/approval-flows`.

## 8. Master Laporan Interview (`/api/recruitment/report-items`, sejak 2026-11-24)

Item form Laporan Interview, dipakai Interview HR dan Interview User (form keduanya sama). Diisi awal dari dokumen klien "Laporan Interview HR" (29 item). Skala penilaian tetap: `KS` Kurang Sekali, `K` Kurang, `C` Cukup, `B` Baik, `BS` Baik Sekali.

| Aksi | Method & endpoint | Keterangan |
| --- | --- | --- |
| Form untuk ditampilkan | `GET /api/recruitment/report-items/form` | `{ scale, sections: [{ name, groups: [{ name, description, items: [{ id, name, description, is_optional }] }] }] }`. `group.name` `null` = item tanpa kelompok (mis. Pola Kerja). Hanya item aktif, urut `sort_order` |
| List master | `GET /api/recruitment/report-items` | Datar, urut `sort_order`. `?include_inactive=true` untuk ikut menampilkan yang nonaktif |
| Tambah | `POST /api/recruitment/report-items` | `section` dan `item_name` wajib; `group_name`, `group_description`, `item_description`, `is_optional` (default `false`), `sort_order` (default paling akhir) opsional |
| Ubah | `PUT /api/recruitment/report-items/:id` | Field yang sama, plus `is_active` untuk mengaktifkan lagi |
| Nonaktifkan | `DELETE /api/recruitment/report-items/:id` | Item tidak muncul di laporan baru; laporan lama menyimpan salinannya sendiri |

- Nama item harus unik dalam satu `section` + `group_name` di antara item aktif (400 `The item already exists in this section and group`).
- `is_optional` (`true`) = item bertanda * di form klien (bagian Pola Kerja, Kemampuan Memimpin, Kemampuan Bahasa Mandarin): boleh tidak dinilai. Item lain wajib dinilai sebelum memilih rekomendasi/keputusan (berlaku di fase H-C/H-D).
- Tampilkan huruf bagian (A, B, C) dan nomor item berdasarkan urutan dari response; nama di master tanpa penomoran.
