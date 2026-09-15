# ZKTeco SenseFace 2A Attendance Integration

This module receives attendance transactions directly from a SenseFace 2A in
TA Push mode. The device remains responsible for retaining transactions while
the network is unavailable. The backend acknowledges a batch only after it is
stored, and `event_key` prevents retransmitted transactions from being counted
twice.

## Database setup

Create the four attendance tables in both configured databases:

```bash
npm run db:sync-attendance
```

Set `ATTENDANCE_DOUBLE_DATABASE=false` only when attendance data should be
written to DB1 without mirroring it to DB2. Dual database writes are enabled by
default.

Devices are discovered automatically by default. Set
`ATTENDANCE_AUTO_REGISTER_DEVICES=false` to require administrators to register
every serial number before the first connection. The default timezone for an
automatically discovered device is `+07:00`; override it with
`ATTENDANCE_DEFAULT_TIMEZONE_OFFSET` when necessary.

## Register the device

Manual registration is optional. When the machine makes its first Push
Protocol request, the backend creates an active device record using the `SN`
query parameter, marks `is_auto_registered` as true, and updates
`last_seen_at`. An administrator can then update its name, location, and
timezone through the API.

To register a device manually before pointing it to this server:

```http
POST /api/attendance-devices
Content-Type: application/json
Cookie: token=<application JWT>

{
  "serial_number": "YOUR_DEVICE_SERIAL",
  "name": "Main Office SenseFace 2A",
  "location": "Main entrance",
  "timezone_offset": "+07:00"
}
```

An explicitly deactivated device remains blocked and will not be reactivated
by automatic discovery.

## Register employees

`device_user_id` must exactly match the PIN/User ID stored on the device:

```http
POST /api/employees
Content-Type: application/json
Cookie: token=<application JWT>

{
  "employee_code": "EMP-001",
  "device_user_id": "1001",
  "full_name": "Example Employee",
  "id_company": 1,
  "id_division": 1
}
```

If a device transaction arrived before its employee was registered, link and
process those unmatched transactions afterward:

```http
POST /api/attendances/reprocess/1
Content-Type: application/json
Cookie: token=<application JWT>

{}
```

## Configure SenseFace 2A

On the device:

1. Select `T&A Push` as the device/push mode.
2. Open `COMM` > `Cloud Server Setting` or `ADMS Setting`.
3. Enter this backend's reachable host/IP and port.
4. Select HTTP or HTTPS to match the deployed backend.
5. Use Fixed punch-state mode when employees explicitly select check-in,
   check-out, break, or overtime states.

The device calls these unauthenticated protocol endpoints automatically:

- `GET /iclock/cdata`
- `POST /iclock/cdata?table=ATTLOG`
- `GET /iclock/getrequest`
- `POST /iclock/devicecmd`

Do not put application JWT authentication in front of `/iclock`. Restrict the
endpoint at the firewall or reverse proxy when the device has a stable source
network. For a public endpoint, consider disabling automatic registration after
the expected machines have connected.

## Attendance API

- `GET /api/attendance-devices` lists devices and their online/offline state.
- `GET /api/employees` lists employees; it supports `search`, `id_company`,
  `is_active`, `page`, and `limit`.
- `GET /api/attendances/logs` lists immutable punch events.
- `GET /api/attendances` lists processed daily attendance summaries.

Log and summary endpoints support `date_from`, `date_to`, `id_employee`,
`page`, and `limit`. Log queries additionally support
`id_attendance_device`, `device_user_id`, `punch_type`, and
`processing_status`.

Default punch-state mapping:

| Device state | Punch type |
| --- | --- |
| 0 | `check_in` |
| 1 | `check_out` |
| 2 | `break_out` |
| 3 | `break_in` |
| 4 | `overtime_in` |
| 5 | `overtime_out` |

Unknown states remain available in the raw log as `unknown` and are not used
as check-in or check-out values.

Daily summaries use the earliest check-in, latest check-out, and subtract a
valid break interval. A summary is recomputed from all stored events whenever
a delayed or retransmitted event arrives.
