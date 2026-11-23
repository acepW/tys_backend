# Hierarki Department → Division → Position

Tracking perubahan master department, division, dan position agar saling terikat. Semua endpoint berawalan `/api`.

## Progress

| Tahap | Isi                                                                                                              | Status  |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| 1     | Struktur master: kolom FK, script backfill + trim nama, filter list, nama induk di response, cek nonaktif         | Selesai |
| 2     | Validasi kombinasi department/division/position saat create/update user, employee, dan recruitment request (data lama tidak ikut error) | Selesai |
| 3     | Script laporan user/employee/recruitment request yang kombinasinya tidak cocok, dengan saran perbaikan             | Selesai |
| 4     | Update dokumen frontend terkait: [org-hierarchy-frontend.md](org-hierarchy-frontend.md) (baru), recruitment-frontend, recruitment-requirement, ZKTECO_ATTENDANCE, approval-flow-frontend | Selesai |

## Keputusan yang disepakati

| Topik | Keputusan |
| --- | --- |
| Bentuk relasi | `divisions.id_department` (wajib), `positions.id_department` dan `positions.id_division` (boleh null). `users`/`employees` tetap menyimpan ketiga id, nanti divalidasi kecocokannya (tahap 2) |
| Jenis posisi | Posisi divisi: keduanya terisi. Posisi level department: hanya `id_department`. Posisi lintas organisasi: keduanya null |
| `positions.id_department` | Untuk posisi divisi, disalin dari divisinya. Memindah divisi ke department lain ikut memindah posisinya (DB1 dan DB2 dalam satu transaksi) |
| Posisi global | Direktur, Developer, Staff, Internal Manager |
| Posisi "Staff" (id 2) | Tetap global, tidak dipecah per divisi |
| Nonaktif / hapus | Department yang masih punya divisi atau posisi aktif, dan divisi yang masih punya posisi aktif, ditolak (409). Anak tidak ikut dinonaktifkan otomatis |
| Aktifkan lagi | Posisi tidak bisa diaktifkan lagi di bawah department/divisi yang nonaktif (409) |
| Nama | Spasi/tab di awal, di akhir, dan yang berulang dibersihkan saat simpan. Nama unik hanya di antara data **aktif** (posisi id 5 yang nonaktif bernama sama dengan id 4 setelah di-trim) |
| Data lama yang tidak cocok | Tidak diubah otomatis; dilaporkan di tahap 3 |
| `id_level` di posisi | Belum dikerjakan |

### Mapping awal (diisi script)

| Department | Divisi |
| --- | --- |
| 1 Human Resources & General Affairs | 2 Human Resources, 3 General Affairs |
| 2 Internal FAT | 5 Internal FAT |
| 3 Sales & Marketing | 1 Sales & Marketing, 4 Social Media |
| 4 Internal Legal Affairs | 6 Internal Legal Affairs |
| 5 Export Import | 7 Export Import Regulatory, 8 Customer Service EXIM |
| 6 External Legal Affairs | 9 External Legal Affairs, 10 Customer Service Legal |
| 7 Product Certification | 11 Product Regulatory, 12 Product Certification 2nd, 13 Customer Service Product Regulatory, 16 Customer Service Product Certification |
| 8 External FAT | 14 External FAT, 15 Customer Service External FAT |

| Posisi | Induk |
| --- | --- |
| 4 Sales & Marketing Manager, 5 Sales & Marketing Manager (nonaktif) | Department 3 Sales & Marketing |
| 10 HRGA Supervisor | Department 1 HRGA |
| 6 Sales & Marketing Staff | Divisi 1 Sales & Marketing |
| 7 Internal FAT Staff, 8 Internal FAT Supervisor, 9 Internal FAT Manager | Divisi 5 Internal FAT |
| 11 HR Staff | Divisi 2 Human Resources |
| 12 GA Staff | Divisi 3 General Affairs |
| 1 Developer, 2 Staff, 3 Direktur, 13 Internal Manager | Global |

## Setup

Jalankan sekali: `npm run db:sync-org-hierarchy` (aman dijalankan ulang). **Sudah dijalankan di DB1 dan DB2 pada 2026-11-24**: 16 divisi dan 9 posisi terisi, posisi id 5 dan 6 di-trim, `divisions.id_department` sudah NOT NULL. Script ini, di DB1 dan DB2:

1. Menambah kolom `divisions.id_department`, `positions.id_department`, dan `positions.id_division` (nullable dulu, dengan foreign key).
2. Mencocokkan id di mapping di atas dengan namanya. Kalau ada yang tidak cocok, script berhenti tanpa mengisi apa pun. Baris yang sudah terisi tidak dicek dan tidak diubah lagi.
3. Mengisi kolom baru sesuai mapping, hanya untuk baris yang masih kosong.
4. Membersihkan spasi/tab di nama department, divisi, dan posisi (posisi id 5 dan 6).
5. Mengubah `divisions.id_department` jadi NOT NULL kalau semua divisi sudah punya department, lalu menambah index.

Jalankan script **sebelum** kode ini di-deploy: model baru membaca kolom baru, jadi query yang meng-include position/division akan error kalau kolomnya belum ada. Di antara script dan deploy, create divisi lewat kode lama akan gagal karena `id_department` wajib.

## Tahap 1: API master

### Department `/api/departments`

Tidak ada field baru. Perubahan:

- `PUT /:id` dengan `is_active: false` dan `DELETE /:id` ditolak **409** kalau department masih punya divisi atau posisi aktif.
- Nama di-trim; nama sama dengan department aktif lain ditolak 400.

### Division `/api/divisions`

Sejak 2026-11-24 semua endpoint division wajib login (`authenticate`), sama seperti department dan position. Sebelumnya terbuka tanpa token.

| Aksi | Method & endpoint | Keterangan |
| --- | --- | --- |
| List | `GET /api/divisions?id_department=1` | Hanya yang aktif. `id_department` opsional. Setiap baris membawa `department: { id, department_name }` |
| Detail | `GET /api/divisions/:id` | Membawa `department` |
| Buat | `POST /api/divisions` | `division_name`, `division_code` (kosong ditolak 400, sebelumnya error 500), **`id_department` wajib** (department harus aktif, kalau nonaktif 409) |
| Ubah | `PUT /api/divisions/:id` | `id_department` boleh diganti; posisi di divisi itu ikut pindah department |
| Hapus | `DELETE /api/divisions/:id` | Nonaktifkan. Ditolak 409 kalau masih ada posisi aktif |

### Position `/api/positions`

| Aksi | Method & endpoint | Keterangan |
| --- | --- | --- |
| List | `GET /api/positions?id_department=1&id_division=2` | Hanya yang aktif. Tanpa filter: semua. Dengan `id_division`: posisi divisi itu + posisi level department divisi itu + posisi global. Dengan `id_department` saja: semua posisi department itu + posisi global. Setiap baris membawa `department` dan `division` (null kalau tidak ada) |
| Detail | `GET /api/positions/:id` | Membawa `department`, `division`, dan `menu_access` |
| Buat | `POST /api/positions` | `position_name` wajib. `id_division` dan `id_department` opsional (lihat aturan di bawah) |
| Ubah | `PUT /api/positions/:id` | Kalau mengirim `id_department` atau `id_division`, **keduanya diganti**: yang tidak dikirim dianggap null. Kirim keduanya bersamaan dari form |
| Hapus | `DELETE /api/positions/:id` | Nonaktifkan |

Aturan induk posisi:

- Kirim `id_division`: `id_department` diisi otomatis dari divisinya. Kalau `id_department` ikut dikirim dan berbeda, ditolak 400.
- Kirim `id_department` saja: posisi level department.
- Tidak kirim keduanya (atau null): posisi global.
- Department/divisi harus ada (404) dan aktif (409).
- Mengaktifkan lagi posisi yang induknya nonaktif ditolak 409.

Contoh baris list position:

```json
{
  "id": 11,
  "position_name": "HR Staff",
  "id_department": 1,
  "id_division": 2,
  "is_active": true,
  "department": { "id": 1, "department_name": "Human Resources & General Affairs" },
  "division": { "id": 2, "division_name": "Human Resources", "division_code": "HR" }
}
```

## Tahap 2: Validasi kombinasi

Berlaku di:

| Endpoint | Kapan dicek |
| --- | --- |
| `POST /api/users`, `PUT /api/users/:id` | Create: selalu (ketiganya memang wajib). Update: hanya kalau salah satu dari `id_department`, `id_division`, `id_position` **berubah** |
| Create/update employee | Create: selalu (ketiganya boleh kosong). Update: hanya kalau salah satunya berubah |
| Create/update recruitment request | Create: selalu. Update: hanya kalau salah satunya berubah (di tahap approval field ini memang tidak bisa diubah). Candidate menyalin dari request, jadi tidak dicek ulang. Offering/contract hanya punya `id_department` |

Aturan (kode: `assertPlacement` di `src/services/orgHierarchy.js`):

- Divisi harus milik department yang dipilih. Divisi tanpa department ditolak.
- Posisi divisi harus sama department **dan** divisinya; posisi level department harus sama department-nya; posisi global cocok di mana saja.
- Id yang dikirim harus ada (404). Id yang **berubah** harus aktif (409); id lama yang sudah nonaktif tetap boleh disimpan apa adanya.
- Ketidakcocokan ditolak **400**, contoh: `Position Internal FAT Staff belongs to department 2, not 3`.
- Membandingkan "berubah" memakai nilai angka, jadi form yang mengirim ulang id yang sama (angka atau string) tidak memicu cek. Data lama yang tidak cocok tetap bisa diedit field lainnya.

Data saat ini (2026-11-24) yang tidak cocok dan akan ditolak kalau department/divisi/posisinya diubah tanpa diperbaiki sekaligus: 7 dari 10 user (hampir semua di department 1 HRGA + divisi 1 Sales & Marketing, padahal divisi 1 milik department 3), 4 dari 5 employee, 3 dari 8 recruitment request (posisi Sales & Marketing Manager tanpa department). Detailnya dilaporkan script tahap 3.

Catatan: approval yang di-scope per department/divisi (vendor, payment request, service pricing) membaca `users.id_department`/`id_division`, jadi user dengan data salah bisa melihat/menyetujui dokumen department yang salah sampai datanya dirapikan.

## Tahap 3: Laporan data yang tidak cocok

`npm run db:report-org-hierarchy`, hanya membaca DB1, tidak mengubah apa pun. Opsi:

- `-- --csv <file>`: juga menulis CSV (kolom: source, id, label, is_active, department, division, position, suggested_*, problems).
- `-- --all`: ikut menampilkan record nonaktif (default hanya yang aktif).

Yang dicek per user, employee, dan recruitment request: aturan yang sama dengan tahap 2 (`placementProblems`), plus id yang menunjuk ke master yang tidak ada atau nonaktif.

Saran perbaikan (`suggestPlacement`) mengikuti **posisi** dulu, karena posisi menentukan hak menu dan approval:

- Posisi divisi: department dan divisi diambil dari posisi.
- Posisi level department: department dari posisi; divisi dipertahankan kalau milik department itu, kalau tidak ditampilkan `-` (harus dipilih ulang).
- Posisi global (Direktur, Developer, Staff): department mengikuti divisi. Ini tebakan, **cek manual**: bisa jadi divisinya yang salah, bukan department-nya.

Hasil 2026-11-24 (14 record):

| Data | Jumlah | Pola |
| --- | --- | --- |
| User | 7 dari 10 | Semua tercatat di dept 1 HRGA + divisi 1 Sales & Marketing. Saran: #5 Internal FAT Manager dan #7 Internal FAT Staff → dept 2 / divisi 5 Internal FAT; #3 dan #4 (posisi Sales & Marketing) → dept 3; #1 Developer, #2 Staff, #8 Direktur (posisi global) perlu dicek manual |
| Employee | 4 dari 5 | #2 dan #4 (Sales & Marketing Manager) di divisi Human Resources → dept 3, divisi dipilih ulang; #1 dan #5 (Developer) dept 1 + divisi Sales & Marketing, cek manual |
| Recruitment request | 3 dari 8 | #2, #3 (approve) dan #4 (request hr staff) tanpa department/divisi, posisi Sales & Marketing Manager → dept 3. Request yang sudah approve atau sedang di tahap approval tidak bisa diubah lewat form; perbaiki lewat DB kalau perlu |

User dan employee dirapikan lewat form edit (validasi tahap 2 memastikan kombinasi barunya cocok). Jalankan laporan lagi sampai hasilnya 0.

## Tahap 4: Dokumen frontend

| Dokumen | Perubahan |
| --- | --- |
| [org-hierarchy-frontend.md](org-hierarchy-frontend.md) | **Baru.** Panduan dropdown berantai di form user/employee/recruitment, pesan error 400/404/409, form master department/division/position |
| [recruitment-frontend.md](recruitment-frontend.md) | Sumber dropdown department/division/position memakai filter; catatan "tanpa filter" diganti aturan validasi |
| [recruitment-requirement.md](recruitment-requirement.md) | Poin 4 (Divisi sesuai departemen) jadi "Sebagian"; tahap D mencatat hierarki Department → Division sudah ada, Company → Department belum |
| [ZKTECO_ATTENDANCE.md](ZKTECO_ATTENDANCE.md) | Contoh create employee ditambah `id_department` (hanya `id_division` sekarang ditolak 400) |
| [approval-flow-frontend.md](approval-flow-frontend.md) | Catatan: list position membawa department/divisi untuk pemilih approver |

Ikut diperbaiki di tahap ini: create divisi tanpa `division_code` sekarang ditolak 400 (`Division code is required`), sebelumnya error 500 dari database.
