# Panduan Frontend: Department → Division → Position

Sejak 2026-11-24 ketiga master ini saling terikat. Divisi selalu milik satu department, dan posisi bisa milik satu divisi, satu department, atau lintas organisasi. Backend menolak kombinasi yang tidak cocok. Semua endpoint berawalan `/api` dan wajib login, **termasuk `/api/divisions`** (sebelumnya terbuka tanpa token).

Tracking dan keputusannya: [org-hierarchy.md](org-hierarchy.md).

## Bentuk data

```text
Department
  ├─ Division ─── Position divisi          (id_department + id_division terisi)
  └─ Position level department             (hanya id_department, mis. HRGA Supervisor)
Position global                            (keduanya null, mis. Direktur, Developer, Staff)
```

Response divisi dan posisi sekarang membawa induknya:

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

`department`/`division` bernilai `null` kalau posisinya tidak punya induk itu.

## Dropdown berantai (form user, employee, recruitment request)

1. **Department**: `GET /api/departments`
2. **Division**: `GET /api/divisions?id_department={department}`. Hanya divisi milik department itu.
3. **Position**: `GET /api/positions?id_department={department}&id_division={division}`. Isinya posisi divisi itu, posisi level department itu (tanpa divisi), dan posisi global. Kalau divisi belum/tidak dipilih, kirim `id_department` saja: semua posisi department itu + posisi global.

- Kalau department diganti, kosongkan division dan position. Kalau division diganti, kosongkan position.
- Kelompokkan daftar position supaya mudah dibaca, misalnya berdasarkan `division?.division_name ?? department?.department_name ?? "Global"`.
- Saat membuka form edit data lama, nilai yang tersimpan bisa saja tidak ada di daftar hasil filter (data lama yang belum dirapikan). Tetap tampilkan nilainya; backend hanya mengecek kalau salah satu dari ketiganya **diubah**.

Pilihan dari dropdown berantai selalu lolos validasi. Kalau tetap ditolak, tampilkan `message` dari response:

| Status | Arti | Contoh `message` |
| --- | --- | --- |
| 400 | Kombinasi tidak cocok | `Division Human Resources does not belong to department 3`, `Position Internal FAT Staff belongs to department 2, not 3` |
| 404 | Id tidak ada | `Position not found` |
| 409 | Id yang baru dipilih sudah nonaktif | `Division 3 is inactive` |

Berlaku di `POST/PUT /api/users`, create/update employee, dan create/update recruitment request. Kandidat recruitment tetap menyalin department/divisi/posisi dari request-nya.

## Form master

### Department

Tidak ada field baru. **Hapus/nonaktifkan** ditolak `409` kalau department masih punya divisi atau posisi aktif (`Department still has 2 active division(s) and 1 active position(s)`): nonaktifkan atau pindahkan anaknya dulu.

### Division

| Field | Wajib | Keterangan |
| --- | --- | --- |
| `division_name` | Ya | Unik di antara divisi aktif |
| `division_code` | Ya | |
| `id_department` | **Ya (baru)** | Dropdown dari `GET /api/departments`. Department nonaktif ditolak 409 |

- List bisa difilter `?id_department=`; tampilkan kolom department dari `department.department_name`.
- Mengganti department di form edit ikut memindah semua posisi divisi itu ke department baru. Beri konfirmasi ke user sebelum menyimpan.
- **Hapus** ditolak `409` kalau divisi masih punya posisi aktif.

### Position

| Field | Wajib | Keterangan |
| --- | --- | --- |
| `position_name` | Ya | Unik di antara posisi aktif |
| `id_department` | Tidak | Dropdown department. Kosong = posisi global |
| `id_division` | Tidak | Dropdown `GET /api/divisions?id_department=`. Kosong = posisi level department |

- Pilih divisi: department ikut terisi dari divisi (kalau dikirim berbeda, ditolak 400).
- **Saat update, selalu kirim `id_department` dan `id_division` bersamaan.** Kalau hanya salah satu yang dikirim, yang tidak dikirim dianggap `null`. Kalau tidak mengubah induk, jangan kirim keduanya.
- Mengaktifkan lagi posisi yang department/divisinya nonaktif ditolak 409.
- Detail `GET /api/positions/:id` membawa `department`, `division`, dan `menu_access`.

## Nama

Spasi/tab di awal, di akhir, dan spasi berulang di nama department, divisi, dan posisi dibersihkan backend saat disimpan. Nama dianggap duplikat hanya terhadap data **aktif**, jadi nama data yang sudah dinonaktifkan boleh dipakai lagi.
