# Panduan Frontend: Approval Flow dan My Task

Dokumen ini menjelaskan cara frontend menampilkan tombol action, halaman My Task, dan halaman setting approval flow. Semua endpoint berawalan `/api` dan memakai cookie login yang sama seperti endpoint lain.

## Konsep singkat

- Setiap dokumen (invoice, contract, dan seterusnya) punya **status**. Di status tertentu, dokumen **menunggu action** dari seseorang: submit, approve/reject, signing, atau input payment.
- **Approval flow** menentukan **posisi** mana yang boleh melakukan action di status itu. Admin mengaturnya di halaman setting.
- Backend sudah menghitung semuanya. Frontend **tidak perlu** mencocokkan posisi atau status sendiri. Cukup baca dua field di setiap dokumen:

| Field                   | Arti                                                                                     | Dipakai untuk                         |
| ----------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| `is_can_approve_reject` | `true` kalau user yang sedang login boleh melakukan action di status dokumen saat ini. | Menampilkan atau menyembunyikan tombol |
| `action_label`          | Nama action yang sedang ditunggu, misalnya `Signing Invoice`. `null` kalau tidak ada.  | Teks tombol, badge, atau keterangan   |

> Meski namanya `is_can_approve_reject`, flag ini berlaku untuk **semua action**, termasuk submit, signing, dan input payment.

## 1. Tombol action di list dan detail

Semua `GET` list dan detail di fitur berikut sudah membawa `is_can_approve_reject` dan `action_label` di setiap dokumen:

`/service-pricing`, `/quotations`, `/pre-orders`, `/contracts`, `/invoices`, `/debit-notes`, `/vendors`, `/vendor-edits`, `/payment-requests`

Contoh `GET /api/invoices/12`:

```json
{
  "success": true,
  "code": 200,
  "message": "Invoice retrieved successfully",
  "data": {
    "id": 12,
    "invoice_no": "INV/2026/010",
    "status": "approved",
    "is_can_approve_reject": true,
    "action_label": "Signing Invoice"
  }
}
```

Aturan tampilan:

| `is_can_approve_reject` | `action_label` | Yang ditampilkan                                                              |
| ----------------------- | -------------- | ----------------------------------------------------------------------------- |
| `true`                  | ada            | Tombol action sesuai status (lihat tabel di bagian 4)                         |
| `false`                 | ada            | Tanpa tombol. Boleh tampilkan badge, misalnya "Menunggu: Signing Invoice"     |
| `false`                 | `null`         | Tanpa tombol dan tanpa badge. Dokumen tidak menunggu action, misalnya `paid` |

Tombol yang tepat ditentukan dari **status** dokumen. Contohnya invoice berstatus `on verification` menampilkan tombol Approve dan Reject, sedangkan berstatus `approved` menampilkan tombol Signing.

## 2. Halaman My Task

My Task berisi dokumen yang sedang menunggu action dari user yang login.

### Semua tugas dari semua fitur

`GET /api/my-tasks`

Mengembalikan jumlah per fitur (untuk badge di menu) sekaligus **semua** dokumen yang menunggu action dari semua fitur, diurutkan dari yang terbaru. Mode ini tanpa pagination.

```json
{
  "success": true,
  "data": {
    "total": 3,
    "summary": [
      { "approval_for": "service pricing", "label": "Service Pricing", "total": 0 },
      { "approval_for": "quotation", "label": "Quotation", "total": 2 },
      { "approval_for": "purchase order", "label": "Purchase Order", "total": 0 },
      { "approval_for": "contract", "label": "Contract", "total": 0 },
      { "approval_for": "invoice", "label": "Invoice", "total": 1 },
      { "approval_for": "debit note", "label": "Debit Note", "total": 0 },
      { "approval_for": "vendor", "label": "Vendor", "total": 0 },
      { "approval_for": "vendor revision", "label": "Vendor Revision", "total": 0 },
      { "approval_for": "payment request", "label": "Payment Request", "total": 0 }
    ],
    "tasks": [
      {
        "id": 12,
        "invoice_no": "INV/2026/010",
        "status": "approved",
        "createdAt": "2026-10-05T03:00:00.000Z",
        "approval_for": "invoice",
        "approval_for_label": "Invoice",
        "document_no": "INV/2026/010",
        "action_label": "Signing Invoice",
        "is_can_approve_reject": true
      },
      {
        "id": 3,
        "quotation_no": "QUO/2026/003",
        "status": "pending",
        "approval_for": "quotation",
        "approval_for_label": "Quotation",
        "document_no": "QUO/2026/003",
        "action_label": "Approve / Reject Quotation",
        "is_can_approve_reject": true
      }
    ]
  }
}
```

Setiap item di `tasks` berisi **semua kolom** dokumen dari fitur asalnya, tanpa relasi (customer, company, dan lainnya tidak ikut). Karena kolomnya berbeda tiap fitur, pakai field yang seragam untuk tabel gabungan:

| Field                | Isi                                                    |
| -------------------- | ------------------------------------------------------ |
| `approval_for`       | Kode fitur, untuk menentukan halaman detail yang dibuka |
| `approval_for_label` | Nama fitur untuk ditampilkan, misalnya `Invoice`        |
| `document_no`        | Nomor dokumen                                          |
| `status`             | Status dokumen saat ini                                |
| `action_label`       | Action yang ditunggu                                   |
| `id`                 | Id dokumen di fitur asalnya                            |

### Daftar tugas satu fitur (untuk tab atau tabel)

`GET /api/my-tasks?approval_for=invoice&page=1&limit=10`

Nilai `approval_for` diambil dari `summary` di atas. Karena ada spasi, encode di URL, misalnya `approval_for=payment%20request`.

```json
{
  "success": true,
  "pagination": { "total_data": 4, "total_page": 1, "current_page": 1, "per_page": 10 },
  "data": [
    {
      "id": 12,
      "invoice_no": "INV/2026/010",
      "status": "approved",
      "approval_for": "invoice",
      "document_no": "INV/2026/010",
      "action_label": "Signing Invoice",
      "is_can_approve_reject": true
    }
  ]
}
```

- Field tambahannya sama dengan `tasks` di atas.
- Isi baris adalah semua kolom dokumen tanpa relasi. Untuk data relasi, buka halaman detail fitur masing-masing dengan `id`.
- Semua baris di My Task selalu `is_can_approve_reject: true`.

### Cek satu dokumen (opsional)

`GET /api/my-tasks/can-act?approval_for=invoice&id=12` → `{ "data": { "is_can_approve_reject": true } }`

Biasanya tidak perlu dipakai, karena `GET` detail sudah membawa flag ini.

## 3. Setelah action berhasil

Status dokumen berubah, jadi `is_can_approve_reject` dan `action_label` juga ikut berubah. Setelah action berhasil:

1. Ambil ulang detail atau list dokumen. Response dari endpoint action tidak membawa `is_can_approve_reject` dan `action_label`.
2. Ambil ulang `GET /api/my-tasks` supaya badge jumlah tugas ikut ter-update.

## 4. Daftar fitur, status, dan tombol

| Fitur (`approval_for`) | Status dokumen        | Label default                                    | Tombol            | Endpoint                                           |
| ---------------------- | --------------------- | ------------------------------------------------ | ----------------- | -------------------------------------------------- |
| `service pricing`      | `pending`             | Approve / Reject Service Pricing                 | Approve, Reject   | `PATCH /service-pricing/approve/:id`, `/reject/:id` |
| `quotation`            | `pending`             | Approve / Reject Quotation                       | Approve, Reject   | `PATCH /quotations/approve/:id`, `/reject/:id`     |
| `purchase order`       | `pending`             | Approve / Reject Purchase Order                  | Approve, Reject   | `PATCH /pre-orders/approve/:id`, `/reject/:id`     |
| `contract`             | `pending`             | Submit Contract                                  | Submit            | `PATCH /contracts/submit/:id`                      |
| `contract`             | `on verification`     | Approve / Reject Contract                        | Approve, Reject   | `PATCH /contracts/approve/:id`, `/reject/:id`      |
| `contract`             | `approved`            | Send Contract to Customer                        | Send to Customer  | `PATCH /contracts/send-to-customer/:id`            |
| `contract`             | `sending to customer` | Approve / Reject Contract by Customer            | Approve, Reject   | `PATCH /contracts/approve-customer/:id`, `/reject-customer/:id` |
| `invoice`              | `pending`             | Submit Invoice                                   | Submit            | `PATCH /invoices/submit/:id`                       |
| `invoice`              | `on verification`     | Approve / Reject Invoice                         | Approve, Reject   | `PATCH /invoices/approve/:id`, `/reject/:id`       |
| `invoice`              | `approved`            | Signing Invoice                                  | Signing           | `PATCH /invoices/signing/:id`                      |
| `invoice`              | `signing`             | Send Invoice for Payment                         | Waiting Payment   | `PATCH /invoices/waiting-for-payment/:id`          |
| `invoice`              | `waiting for payment` | Input Payment Invoice                            | Input Payment     | `PATCH /invoices/pay/:id`                          |
| `debit note`           | `pending`             | Submit Debit Note                                | Submit            | `PATCH /debit-notes/submit/:id`                    |
| `debit note`           | `on verification`     | Approve / Reject Debit Note                      | Approve, Reject   | `PATCH /debit-notes/approve/:id`, `/reject/:id`    |
| `debit note`           | `approved`            | Input Payment Debit Note                         | Input Payment     | `PATCH /debit-notes/paid/:id`                      |
| `vendor`               | `pending`             | Approve / Reject Vendor                          | Approve, Reject   | `PATCH /vendors/approve/:id`, `/reject/:id`        |
| `vendor revision`      | `pending`             | Approve / Reject Vendor Revision                 | Approve, Reject   | `PATCH /vendor-edits/approve/:id`, `/reject/:id`   |
| `payment request`      | `pending`             | Approve / Reject Payment Request by Dept Manager | Approve, Reject   | `PATCH /payment-requests/approve/:id`, `/reject/:id` |
| `payment request`      | `approve dept manager` | Approve / Reject Payment Request by FAT         | Approve, Reject   | sama seperti di atas                               |
| `payment request`      | `approve fat`         | Approve / Reject Payment Request by Manager FAT  | Approve, Reject   | sama seperti di atas                               |
| `payment request`      | `approve manager fat` | Approve / Reject Payment Request by Director     | Approve, Reject   | sama seperti di atas                               |
| `payment request`      | `approve director`    | Approve / Reject Payment Request by Cashier      | Approve, Reject   | sama seperti di atas                               |
| `payment request`      | `approve cashier`     | Input Payment Payment Request                    | Input Payment     | `PATCH /payment-requests/paid/:id`                 |

Catatan:

- Label di tabel adalah label default. Admin bisa mengubahnya, jadi tampilkan `action_label` dari API, jangan hardcode label.
- Body request setiap endpoint action **tidak berubah** dari sebelumnya. Payment request tetap mengirim `role` di body approve/reject seperti biasa.
- Status yang tidak ada di tabel tidak menunggu action, misalnya `rejected`, `paid`, `approve by customer`, dan `continue_to_debit_note`.
- Fitur `purchase order` memakai endpoint `/pre-orders`.
- Fitur `vendor revision` adalah data di `/vendor-edits`. Selama revisi berstatus `pending`, vendor-nya berstatus `request revision`. Tombol approve/reject revisi ada di data vendor edit, bukan di vendor, jadi vendor berstatus `request revision` tidak menampilkan tombol.

## 5. Error dari endpoint action

Endpoint action bisa menolak request dengan format error standar:

```json
{
  "success": false,
  "message": "You are not allowed to act on Invoice with status \"approved\"",
  "errors": null,
  "data": null
}
```

| HTTP | Arti                                                                                           | Saran tampilan                                                     |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 403  | User tidak punya akses untuk action di status ini                                              | "Anda tidak memiliki akses untuk melakukan action ini"             |
| 409  | Status dokumen sudah berubah, misalnya sudah di-approve orang lain atau step sebelumnya belum dilakukan | Tampilkan pesan, lalu ambil ulang detail dokumen                   |

> **Masa transisi:** saat ini backend belum memblokir action. Pelanggaran hanya dicatat di log server, dan error 403/409 baru muncul setelah pengecekan diaktifkan. Karena itu, frontend **wajib** menyembunyikan tombol berdasarkan `is_can_approve_reject` mulai sekarang, jangan menunggu error dari backend.

## 6. Halaman setting approval flow (admin)

### Pilihan untuk form

`GET /api/approval-flows/targets` mengembalikan fitur, status, label default, dan scope yang didukung. Pakai untuk mengisi dropdown supaya tidak perlu hardcode.

```json
{
  "data": [
    {
      "approval_for": "payment request",
      "label": "Payment Request",
      "statuses": [
        { "status": "pending", "label": "Approve / Reject Payment Request by Dept Manager" },
        { "status": "approve dept manager", "label": "Approve / Reject Payment Request by FAT" }
      ],
      "scopes": ["all", "department"]
    }
  ]
}
```

Alur form yang disarankan:

1. Admin memilih fitur. Dropdown status diisi dari `statuses`.
2. Admin memilih status. Field label diisi otomatis dari `statuses[].label`, dan masih bisa diedit.
3. Dropdown scope diisi dari `scopes`.
4. Admin memilih posisi yang boleh melakukan action.

### Daftar flow per fitur

`GET /api/approval-flows?group_by=approval_for`

```json
{
  "data": [
    {
      "approval_for": "invoice",
      "label": "Invoice",
      "approval_flows": [
        {
          "id": 9,
          "approval_for": "invoice",
          "status": "on verification",
          "label": "Approve / Reject Invoice",
          "rule_type": "any",
          "scope": "all",
          "approval_flow_positions": [
            { "id": 15, "id_position": 3, "is_active": true, "position": { "id": 3, "position_name": "Developer" } }
          ]
        }
      ]
    }
  ]
}
```

- Urutan fitur dan status sudah diurutkan sesuai alur, jadi bisa langsung ditampilkan.
- Fitur yang belum punya flow tidak muncul di daftar.
- Tanpa `group_by`, endpoint ini mengembalikan daftar biasa dengan pagination seperti sebelumnya.

### Membuat dan mengubah flow

`POST /api/approval-flows`

```json
{
  "approval_for": "invoice",
  "status": "approved",
  "label": "Signing Invoice",
  "rule_type": "any",
  "scope": "all",
  "approval_flow_positions": [{ "id_position": 3, "is_active": true }]
}
```

`PUT /api/approval-flows/:id` memakai body yang sama. Untuk `approval_flow_positions`:

- Item dengan `id` akan di-update.
- Item tanpa `id` akan ditambahkan.
- Posisi lama yang tidak dikirim akan dihapus. Array kosong berarti semua posisi dihapus.

Aturan validasi (error 400):

| Field         | Aturan                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| `approval_for`, `status` | Harus ada di `GET /api/approval-flows/targets`                                |
| `rule_type`   | Saat ini hanya `any`, cukup satu orang dari posisi yang terdaftar                         |
| `scope`       | `all`, `department`, atau `division`, sesuai `scopes` fitur tersebut                     |
| Duplikat      | Satu fitur dan satu status hanya boleh punya satu flow aktif. Edit flow yang sudah ada, jangan membuat baru |

### Arti scope

| Scope        | Siapa yang bisa action                                                    | Fitur yang mendukung |
| ------------ | ------------------------------------------------------------------------- | -------------------- |
| `all`        | Semua user di posisi yang dipilih, untuk dokumen dari mana pun           | Semua fitur          |
| `department` | Hanya untuk dokumen dari department yang sama dengan user                | Payment request, vendor, vendor revision |
| `division`   | Hanya untuk dokumen dari divisi yang sama dengan user                    | Service pricing      |

Perubahan posisi, department, atau divisi user langsung berlaku tanpa user perlu login ulang.
