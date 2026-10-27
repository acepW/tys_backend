# Panduan Frontend: Recruitment

Semua endpoint berawalan `/api/recruitment` dan butuh login.

## Konsep singkat

Ada 6 modul. Semuanya dibuat dengan status `pending` (Pengajuan Kandidat: `request hr staff`), lalu di-**approve** atau di-**reject** (reject wajib `note`). Pengajuan Kandidat punya approval bertahap (lihat bagian 1). Approve/reject diatur lewat approval flow per modul; untuk sementara approver-nya posisi Developer.

| Modul              | Path               | `approval_for`               | Syarat create                                             |
| ------------------ | ------------------ | ---------------------------- | --------------------------------------------------------- |
| Pengajuan Kandidat | `/requests`        | `recruitment request`        | -                                                         |
| Database Kandidat  | `/candidates`      | `recruitment candidate`      | -                                                         |
| Interview HR       | `/hr-interviews`   | `recruitment hr interview`   | Kandidat `approve`                                        |
| Interview User     | `/user-interviews` | `recruitment user interview` | Interview HR `approve` dengan `decision` = `passed`       |
| Offering Letter    | `/offerings`       | `recruitment offering`       | Interview User `approve` dengan `decision` = `accepted`   |
| Kontrak Kerja      | `/contracts`       | `recruitment contract`       | Offering Letter `approve`                                 |

Aturan step:

- Satu kandidat hanya boleh punya **satu** dokumen `pending`/`approve` per step. Kalau dokumen step di-reject, buat dokumen baru untuk step itu.
- Dokumen step hanya bisa diedit saat `pending`, pengajuan selama masih dalam proses approval (`request hr staff`, `request spv/manager hr`, `request director`). **Kandidat bisa diedit kapan saja**, termasuk untuk reschedule jadwal interview.
- Kontrak kerja yang di-approve **tidak** otomatis membuat data karyawan.

Status dokumen (`status`): `pending`, `approve`, `reject`. Pengajuan Kandidat memakai `request hr staff`, `request spv/manager hr`, `request director`, `approve`, `reject`.

## Endpoint (sama untuk setiap modul)

| Aksi     | Method & endpoint              | Keterangan                                    |
| -------- | ------------------------------ | --------------------------------------------- |
| List     | `GET /{modul}`                 | Filter per modul lihat di bawah, `page`, `limit` |
| Detail   | `GET /{modul}/:id`             | Termasuk `verification_progress`              |
| Buat     | `POST /{modul}`                | Status `pending` (pengajuan: `request hr staff`) |
| Edit     | `PUT /{modul}/:id`             | Kirim hanya field yang diubah                 |
| Approve  | `PATCH /{modul}/approve/:id`   | Body `{ "note": "opsional" }`                 |
| Reject   | `PATCH /{modul}/reject/:id`    | Body `{ "note": "wajib" }`                    |

List dan detail berisi `is_can_approve_reject` dan `action_label`, sama seperti fitur approval lain.

Dropdown kandidat di form step: `GET /candidates/options?stage=...`, `stage` = `hr interview`, `user interview`, `offering`, atau `contract`. Isinya hanya kandidat yang **boleh** masuk step tersebut (approved, step sebelumnya approved sesuai syarat, dan belum punya dokumen aktif di step itu). Setiap kandidat berisi `job_title`, `position`, `department`, dan `previous_step` (dokumen step sebelumnya, untuk prefill form, mis. offering diisi dari interview user, kontrak dari offering).

File mengikuti format file lain (`original_name`, `stored_name`, `url`, `mime_type`, `size`); upload dulu ke folder `recruitment`. Saat edit, sertakan `id` file lama yang ingin dipertahankan.

## 1. Pengajuan Kandidat / Candidate Request (`/requests`)

```json
{
  "id_company": 1,
  "id_department": 3,
  "id_division": 1,
  "id_position": 2,
  "id_level": 1,
  "number_of_people": 2,
  "job_requirement": "Pengalaman minimal 1 tahun di bidang gudang",
  "job_description": "Mengelola administrasi gudang",
  "request_type": "replacement",
  "reason": "Karyawan sebelumnya resign",
  "hiring_deadline": "2026-12-01",
  "hiring_status": "open"
}
```

| Field              | Wajib | Label di form        | Keterangan |
| ------------------ | ----- | -------------------- | ---------- |
| `id_company`       | Ya    | Company              | Dari `GET /api/companies` |
| `id_department`    | Ya    | Department           | Dari `GET /api/departments` |
| `id_division`      | Ya    | Division             | Dari `GET /api/divisions` |
| `id_position`      | Ya    | Position             | Dari `GET /api/positions` |
| `id_level`         | Ya    | Level                | Dari `GET /api/levels` (master baru, lihat bagian 7) |
| `number_of_people` | Ya    | Number of People     | Bilangan bulat > 0 |
| `job_requirement`  | Tidak | Job Requirement      | Menggantikan field lama `job_recruitment` |
| `job_description`  | Tidak | Job Description      | |
| `request_type`     | Ya    | Type of Request      | `replacement` (Replacement) atau `additional member` (Additional Member) |
| `reason`           | Tidak | Reason               | |
| `hiring_deadline`  | Tidak | Hiring Deadline      | `YYYY-MM-DD` |
| `hiring_status`    | Tidak | Hiring Status        | `open` (default) atau `close` |

Field lama `job_title` (Jabatan teks) diganti `id_level` dan tidak diterima lagi. Request lama tetap menyimpan `job_title`-nya, dan `id_level`-nya kosong.

Response list/detail membawa `company`, `department`, `division`, `position`, `level`, dan `revisions` (riwayat revisi). Filter list: `id_company`, `id_department`, `id_division`, `id_position`, `id_level`, `request_type`, `hiring_status`, `status`, `search` (job description).

### Alur approval

Tidak ada langkah submit terpisah: begitu dibuat, request langsung menunggu approval HR Staff.

```
create → request hr staff → request spv/manager hr → request director → approve
```

| Status                   | Menunggu        | Bisa edit |
| ------------------------ | --------------- | --------- |
| `request hr staff`       | HR Staff        | Ya        |
| `request spv/manager hr` | SPV/Manager HR  | Ya        |
| `request director`       | Director        | Ya        |
| `approve`                | Selesai         | Tidak (kecuali hiring status, lihat di bawah) |
| `reject`                 | Selesai         | Tidak     |

- Approve/reject di setiap tahap memakai endpoint yang sama: `PATCH /requests/approve/:id` dan `PATCH /requests/reject/:id`. Backend yang menentukan tahapnya dari status saat ini. Reject di tahap mana pun langsung menjadi `reject`.
- **Divisi HR:** jika user pembuat request berada di divisi HR, request langsung dibuat dengan status `request spv/manager hr` (melewati HR Staff). Divisi HR dikenali dari `division_code` yang mengandung `HR` atau `division_name` yang mengandung `Human Resource` / kata `HR`, misalnya `HR`, `HRD`, `HRGA`, `Human Resources`.
- Tampilkan tombol approve/reject berdasarkan `is_can_approve_reject`. `action_label` menyebut tahapnya, misalnya `Approve / Reject Recruitment Request by SPV/Manager HR`.

### Revisi

Selama request masih dalam proses approval (`request hr staff`, `request spv/manager hr`, `request director`), form bisa diubah lewat `PUT /requests/:id` (kirim hanya field yang diubah) oleh **siapa pun**, apa pun divisi atau department-nya. Setelah `approve` / `reject`, request tidak bisa diedit lagi.

**Setiap update dicatat sebagai revisi**: field yang nilainya benar-benar berubah masuk ke `revisions`, dan `verification_progress` mencatat `revised`.

```json
"revisions": [
  { "revision_no": 1, "field": "number_of_people", "old_value": "2", "new_value": "3", "createdAt": "...", "user": { "id": 7, "name": "HR Staff" } },
  { "revision_no": 1, "field": "reason", "old_value": "Karyawan resign", "new_value": "Tambah shift malam", "createdAt": "...", "user": { "id": 7, "name": "HR Staff" } }
]
```

- Field yang diubah dalam satu kali simpan punya `revision_no` yang sama. Kelompokkan berdasarkan `revision_no` untuk menampilkan histori per revisi.
- `old_value` / `new_value` disimpan sebagai teks. Untuk field `id_*`, isinya ID master; tampilkan namanya dengan mencocokkan ke data master.
- `verification_progress` juga mencatat `revised` dengan note berisi daftar field yang diubah, misalnya `Recruitment request revised: number_of_people, reason`.

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

```json
{
  "id_recruitment_request": 5,
  "name": "Budi Santoso",
  "phone_number": "0812-3456-7890",
  "email": "budi@example.com",
  "job_title": "Staff",
  "source": "JobStreet",
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
  "files_cv": [],
  "files_application_form": []
}
```

**Wajib saat create:** `id_recruitment_request` dan `name`. Field lain opsional. Tanggal `YYYY-MM-DD`, jam `HH:MM`, `email` harus format email yang valid.

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

Response list/detail berisi `recruitment_request` (`id`, `status`, `hiring_status`, `number_of_people`, `hiring_deadline`, `request_type`), `company`, `department`, `division`, `position`, dan `level`.

Filter list: `id_recruitment_request`, `id_company`, `id_department`, `id_division`, `id_position`, `id_level`, `name`, `job_title`, `status`.

Response list/detail kandidat sudah membawa data step lain: `hr_interviews`, `user_interviews`, `offerings`, `contracts`, masing-masing **urut terbaru dulu** (pakai index `0`).

Pemetaan kolom tabel Database Kandidat:

| Kolom tabel                               | Field                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Name, Jabatan, Posisi, Department, Sumber | `name`, `job_title`, `position.position_name`, `department.department_name`, `source` |
| CV, Application Form                      | `files_cv`, `files_application_form`                                         |
| DISC, Proses Rec                          | `disc`, `recruitment_process`                                                |
| Interview HR: Mekanisme, Date, Time       | `hr_interview_mechanism`, `hr_interview_date`, `hr_interview_time`           |
| Interview HR: Hasil, Catatan              | `hr_interviews[0].decision`, `hr_interviews[0].interview_result`             |
| Interview User: Mekanisme, Date, Time     | `user_interview_mechanism`, `user_interview_date`, `user_interview_time`     |
| Interview User: Hasil, Catatan            | `user_interviews[0].decision`, `user_interviews[0].assessment`               |
| Offering: Tanggal, Dokumen, KTP, NPWP     | `offerings[0].offering_date`, `offerings[0].files_offering_letter`, `files_ktp`, `files_npwp` |
| Tanggal Mulai Kerja                       | `offerings[0].effective_date`                                                |

Mengubah `name` kandidat ikut mengubah `candidate_name` di semua step-nya.

## 3. Interview HR (`/hr-interviews`)

```json
{
  "id_recruitment_candidate": 1,
  "psychotest_result": "Skor 85",
  "interview_result": "Komunikatif, cocok dengan tim",
  "decision": "passed",
  "work_system": "WFO",
  "salary": "5-6 juta",
  "files_attachment": [],
  "user_interview_mechanism": "Onsite",
  "user_interview_date": "2026-10-25",
  "user_interview_time": "13:30"
}
```

- `decision` wajib: `passed` (Lolos) atau `not passed` (Tidak Lolos).
- Field `user_interview_*` (Jadwal Interview User) hanya dipakai jika `passed`, dan **disimpan ke kandidat**. Reschedule dilakukan HR lewat edit kandidat.
- Department di form diambil dari kandidat yang dipilih (`candidate` di response, atau dari `GET /candidates/options`).
- `id_recruitment_candidate` hanya bisa diisi saat create.
- Filter list (juga untuk Interview User): `id_recruitment_candidate`, `status`, `decision`, `search` (nama kandidat).

## 4. Interview User (`/user-interviews`)

```json
{
  "id_recruitment_candidate": 1,
  "assessment": "Pemahaman teknis baik",
  "decision": "accepted",
  "recommended_salary": 6000000,
  "recommended_benefit": "BPJS, tunjangan transport",
  "active_work_date": "2026-11-02"
}
```

- `decision` wajib: `accepted` (Diterima) atau `not accepted` (Ditolak).
- Jika `accepted`, `active_work_date` wajib. Jika `not accepted`, rekomendasi gaji, benefit, dan tanggal aktif dikosongkan.

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

Jika tidak dikirim saat create, nilai default-nya: `job_title` dan `id_department` dari kandidat; `effective_date`, `salary`, `benefit` dari interview user (tanggal aktif kerja, rekomendasi gaji, rekomendasi benefit); `offering_date` hari ini. `effective_date` wajib (terisi otomatis dari interview user). Filter list: `id_recruitment_candidate`, `status`, `search`.

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

`verification_progress` di detail berisi `created`, `edited`, `approve`, dan `reject` (dengan `note`). Untuk Pengajuan Kandidat, approve/reject menyebut tahapnya: `approve hr staff`, `approve spv/manager hr`, `approve director`, `reject hr staff`, `reject spv/manager hr`, `reject director`, `revised` (setiap edit pengajuan), ditambah `hiring close` / `hiring open`.

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
| 409  | `Recruitment candidate has not been approved yet`                      | Step dibuat untuk kandidat yang belum approved |
| 409  | `Candidate needs ... first`                                            | Step sebelumnya belum approved / tidak lolos |
| 409  | `Candidate already has a pending/approve <step>`                       | Step sudah punya dokumen aktif             |
| 409  | `<Modul> cannot be edited while it is ...`, `<Modul> is already ...`   | Edit/approve dokumen yang sudah diproses   |
| 400  | `number_of_people must be a positive integer`, `request_type must be one of: ...`, `hiring_status must be one of: open, close` | Validasi form Pengajuan Kandidat |
| 409  | `Hiring status can only be changed on an approved request, not ...`, `Hiring is already ...` | Open/close hiring di status yang salah |

## Setup

- Migrasi (sekali per environment): `npm run db:sync-recruitment`. Script ini juga membuat tabel `levels` dan `recruitment_request_revisions`, mengganti nama kolom `job_recruitment` menjadi `job_requirement`, menambah kolom baru Pengajuan Kandidat, dan mengganti status pengajuan `pending` menjadi `request hr staff` (termasuk baris approval flow-nya) serta menambah `request spv/manager hr` / `request director`, lalu menambah kolom baru kandidat (`id_recruitment_request`, `id_company`, `id_division`, `id_level`, `phone_number`, `email`, `hr_interview_meeting_room`, `hr_interview_meeting_room_link`). Aman dijalankan ulang. Jalankan **sebelum** `db:setup-approval-flows` supaya flow `request hr staff` tidak dobel.
- Approval flow: `npm run db:setup-approval-flows [nama_posisi]` membuat flow untuk setiap status yang belum punya flow, termasuk `request spv/manager hr` dan `request director` milik `recruitment request`. Setelah itu atur posisi HR Staff, SPV/Manager HR, dan Director lewat `/api/approval-flows`. Selama `APPROVAL_ENFORCE` belum `true`, approve/reject oleh siapa pun tetap berhasil.
