# Panduan Frontend: Recruitment

Semua endpoint berawalan `/api/recruitment` dan butuh login.

## Konsep singkat

Ada 6 modul. Semuanya dibuat dengan status `pending`, lalu di-**approve** atau di-**reject** (reject wajib `note`). Approve/reject diatur lewat approval flow per modul; untuk sementara approver-nya posisi Developer.

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
- Dokumen step dan pengajuan hanya bisa diedit saat `pending`. **Kandidat bisa diedit kapan saja**, termasuk untuk reschedule jadwal interview.
- Kontrak kerja yang di-approve **tidak** otomatis membuat data karyawan.

Status dokumen (`status`): `pending`, `approve`, `reject`.

## Endpoint (sama untuk setiap modul)

| Aksi     | Method & endpoint              | Keterangan                                    |
| -------- | ------------------------------ | --------------------------------------------- |
| List     | `GET /{modul}`                 | Filter per modul lihat di bawah, `page`, `limit` |
| Detail   | `GET /{modul}/:id`             | Termasuk `verification_progress`              |
| Buat     | `POST /{modul}`                | Status `pending`                              |
| Edit     | `PUT /{modul}/:id`             | Kirim hanya field yang diubah                 |
| Approve  | `PATCH /{modul}/approve/:id`   | Body `{ "note": "opsional" }`                 |
| Reject   | `PATCH /{modul}/reject/:id`    | Body `{ "note": "wajib" }`                    |

List dan detail berisi `is_can_approve_reject` dan `action_label`, sama seperti fitur approval lain.

Dropdown kandidat di form step: `GET /candidates/options?stage=...`, `stage` = `hr interview`, `user interview`, `offering`, atau `contract`. Isinya hanya kandidat yang **boleh** masuk step tersebut (approved, step sebelumnya approved sesuai syarat, dan belum punya dokumen aktif di step itu). Setiap kandidat berisi `job_title`, `position`, `department`, dan `previous_step` (dokumen step sebelumnya, untuk prefill form, mis. offering diisi dari interview user, kontrak dari offering).

File mengikuti format file lain (`original_name`, `stored_name`, `url`, `mime_type`, `size`); upload dulu ke folder `recruitment`. Saat edit, sertakan `id` file lama yang ingin dipertahankan.

## 1. Pengajuan Kandidat (`/requests`)

```json
{
  "job_title": "Staff",
  "id_position": 2,
  "job_recruitment": "Dibutuhkan 2 orang, pengalaman 1 tahun",
  "job_description": "Mengelola administrasi gudang"
}
```

`job_title` (Jabatan, teks) dan `id_position` (Posisi, dari master positions) wajib. Filter list: `search` (jabatan), `id_position`, `status`.

## 2. Database Kandidat (`/candidates`)

```json
{
  "name": "Budi Santoso",
  "job_title": "Staff",
  "id_position": 2,
  "id_department": 3,
  "source": "JobStreet",
  "disc": "Dominan - Influence",
  "recruitment_process": "Screening CV",
  "hr_interview_mechanism": "Online",
  "hr_interview_date": "2026-10-21",
  "hr_interview_time": "09:00",
  "user_interview_mechanism": "Onsite",
  "user_interview_date": "2026-10-25",
  "user_interview_time": "13:30",
  "files_cv": [],
  "files_application_form": []
}
```

Hanya `name` yang wajib. Tanggal `YYYY-MM-DD`, jam `HH:MM`. Filter list: `name`, `job_title`, `id_position`, `id_department`, `status` (sesuai form pencarian Nama, Jabatan, Posisi, Department).

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

`verification_progress` di detail berisi `created`, `edited`, `approve`, dan `reject` (dengan `note`).

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

## Setup

- Migrasi (sekali per environment): `npm run db:sync-recruitment`.
- Approval flow: `npm run db:setup-approval-flows [nama_posisi]` membuat flow `pending` untuk keenam modul jika belum ada. Selama `APPROVAL_ENFORCE` belum `true`, approve/reject oleh siapa pun tetap berhasil.
