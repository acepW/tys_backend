# Panduan Frontend: Customer Code

Sejak 2026-11-18 setiap customer punya **company** (`id_company`) dan **Customer Code** (`customer_code`) yang dibuat otomatis oleh backend saat customer disimpan. Semua endpoint berawalan `/api/customers`.

## Format kode

```text
C-TYSCS-2026-1100001
│ │     │    │ └── nomor urut, minimal 5 digit
│ │     │    └──── bulan customer dibuat (MM)
│ │     └───────── tahun customer dibuat (YYYY)
│ └─────────────── initial company customer (companies.initial_company)
└───────────────── selalu C
```

- Tahun dan bulan mengikuti waktu Jakarta saat customer disimpan.
- Nomor urut dihitung **per initial company** dan **tidak pernah reset**, walaupun bulan atau tahun berganti. Contoh untuk TYSCS: `C-TYSCS-2026-1100001`, `C-TYSCS-2026-1200002`, `C-TYSCS-2027-0100003`.
- Setelah 99999, nomor lanjut menjadi 6 digit (`C-TYSCS-2027-05100000`).
- Sejak 2026-11-24 nomor urut 5 digit (sebelumnya 3 digit). Kode lama 3 digit (mis. `C-TYS-2026-11042`) tetap berlaku dan tidak diubah; nomor berikutnya melanjutkan urutannya (`C-TYS-2026-1100043`).
- Customer yang dihapus tetap memegang kodenya, jadi nomornya tidak dipakai ulang.

## Form create

1. Tampilkan dropdown **Company** (wajib).
2. Ambil pratinjau kode dari `GET /api/customers/next-customer-code`, lalu tampilkan **Customer Code** sesuai company yang dipilih sebagai field **read-only**.
3. Kirim `POST /api/customers` dengan `id_company`. Jangan kirim `customer_code`; kalau dikirim, diabaikan.

```http
GET /api/customers/next-customer-code
```

```json
{
  "success": true,
  "message": "Next customer codes retrieved successfully",
  "data": [
    { "id_company": 1, "company_name": "PT TYS ...", "initial_company": "TYS", "next_number": "00042", "customer_code": "C-TYS-2026-1100042" },
    { "id_company": 3, "company_name": "PT TYSCS ...", "initial_company": "TYSCS", "next_number": "00001", "customer_code": "C-TYSCS-2026-1100001" }
  ]
}
```

Kode ini hanya pratinjau. Kode yang tersimpan ditentukan saat `POST`, jadi bisa maju satu nomor kalau ada user lain yang menyimpan customer untuk company yang sama lebih dulu. Tampilkan kode dari response `POST` sebagai kode akhir.

```http
POST /api/customers
```

```json
{
  "id_company": 3,
  "customer_type": "company",
  "company_name_indo": "PT Contoh Abadi",
  "...": "field lain sama seperti sebelumnya"
}
```

| Field        | Wajib | Keterangan |
| ------------ | ----- | ---------- |
| `id_company` | Ya    | Company aktif yang punya initial. Menentukan initial di kode |
| Field lain   |       | Tidak berubah |

Response berisi customer baru, termasuk `id_company` dan `customer_code`.

## Edit

`PUT /api/customers/:id` **tidak bisa** mengubah `id_company` maupun `customer_code`. Kalau dikirim, keduanya diabaikan. Di form edit, tampilkan company dan kode sebagai read-only.

## List, detail, dan pencarian

- `GET /api/customers` dan `GET /api/customers/:id` sekarang memuat `customer_code`, `id_company`, dan `company` (`id`, `company_name`, `initial_company`).
- `GET /api/customers/search?query=...` juga mencocokkan `customer_code`, selain nama company customer.

## Customer lama

Customer yang sudah ada sebelum fitur ini diberi company **TYS** dan kode `C-TYS-<YYYY>-<MM><urut>` oleh script `npm run db:sync-customer-code`. Urutannya mengikuti id customer, dengan tahun dan bulan dari tanggal customer dibuat. Customer baru TYS melanjutkan nomor setelah customer lama.

## Pesan error

| HTTP | Pesan | Kapan |
| ---- | ----- | ----- |
| 400  | `Failed to create Customer: id_company is required` | `id_company` kosong atau bukan angka |
| 404  | `Failed to create Customer: Company not found` | Company tidak ada atau tidak aktif |
| 400  | `Failed to create Customer: The company has no initial for the customer code` | Company belum punya `initial_company` |
| 409  | `Customer code was just used by another customer; please save again` | Dua user menyimpan customer company yang sama di saat bersamaan. Cukup simpan ulang |
