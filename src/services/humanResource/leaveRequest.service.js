const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../procurement/shared");
const { STAGES } = require("../../models/humanResource/leaveRequest.model");

const FIELDS = [
  "id_employee",
  "type",
  "start_date",
  "end_date",
  "duration",
  "reason",
  "health_facility_name",
  "clinic_phone",
  "clinic_address",
  "doctor_name",
  "sick_letter_status",
];

// Approval chain: supervisor -> hr -> spv hr -> manager hr -> director -> approved.
// With a referral letter the director's approval goes to "request doctor letter"
// (requester uploads the SKD) and then "request verification hr".
// Approval positions are not wired to approval_flows yet, so any user can act;
// only the status order is enforced.
const NEXT_STATUS = Object.fromEntries(
  STAGES.map((stage, index) => [
    stage,
    STAGES[index + 1] ? `request ${STAGES[index + 1]}` : "approved",
  ]),
);

function pick(input) {
  return Object.fromEntries(
    FIELDS.filter((field) => input[field] !== undefined).map((field) => [
      field,
      input[field],
    ]),
  );
}

// Inclusive number of calendar days between two YYYY-MM-DD dates.
function dayCount(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / 86400000) + 1;
}

class LeaveRequestService {
  includes() {
    const db = models.db1;
    return [
      {
        model: db.Employee,
        as: "employee",
        attributes: ["id", "employee_code", "full_name"],
      },
      { model: db.Department, as: "department", required: false },
      {
        model: db.User,
        as: "user_request",
        attributes: ["id", "name", "email"],
      },
      {
        model: db.File,
        as: "files_attachment",
        required: false,
        where: { is_active: true },
      },
      {
        model: db.LeaveRequestVerificationProgress,
        as: "verification_progress",
        separate: true,
        order: [["createdAt", "ASC"]],
        include: [{ model: db.User, as: "user", attributes: ["id", "name"] }],
      },
    ];
  }

  async getById(id) {
    const row = await models.db1.LeaveRequest.findOne({
      where: { id, is_active: true },
      include: this.includes(),
    });
    return row?.toJSON() || null;
  }

  async getAll(where = {}, page, limit) {
    const options = {
      where: { ...where, is_active: true },
      include: this.includes(),
      order: [["createdAt", "DESC"]],
      distinct: true,
    };
    if (page && limit) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
      const { count, rows } =
        await models.db1.LeaveRequest.findAndCountAll(options);
      return {
        data: rows.map((row) => row.toJSON()),
        pagination: {
          total_data: count,
          total_page: Math.ceil(count / limit),
          current_page: page,
          per_page: limit,
        },
      };
    }
    return (await models.db1.LeaveRequest.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  async addProgress(id, userId, status, note, t1, t2) {
    await mirrorCreate(
      "LeaveRequestVerificationProgress",
      { id_leave_request: id, id_user: userId, status, note: note || null },
      t1,
      t2,
    );
  }

  async syncAttachments(id, input, userId, t1, t2) {
    await syncFiles("leave_requests", id, "files_attachment", input.files_attachment, userId, t1, t2);
  }

  async lock(id, t1) {
    const request = await models.db1.LeaveRequest.findOne({
      where: { id, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!request) fail("Leave request not found", 404);
    return request;
  }

  async employeeDepartment(idEmployee, t1) {
    const employee = await models.db1.Employee.findByPk(idEmployee, {
      attributes: ["id", "id_department"],
      transaction: t1,
    });
    if (!employee) fail(`Employee ${idEmployee} not found`);
    return employee.id_department ?? null;
  }

  async create(input, userId, isDoubleDatabase = true) {
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const data = pick(input);
      data.duration ??= dayCount(data.start_date, data.end_date);
      const request = await mirrorCreate(
        "LeaveRequest",
        {
          ...data,
          id_department: await this.employeeDepartment(data.id_employee, t1),
          id_user_request: userId,
          status: "request supervisor",
        },
        t1,
        t2,
      );
      await this.syncAttachments(request.id, input, userId, t1, t2);
      await this.addProgress(request.id, userId, "created", "Leave request created", t1, t2);
      return request.id;
    });
    return this.getById(id);
  }

  // Editable by the creator until the supervisor acts on it.
  async update(id, input, userId, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const request = await this.lock(id, t1);
      if (request.status !== "request supervisor")
        fail("Only leave requests awaiting the supervisor can be edited", 409);
      if (request.id_user_request !== userId)
        fail("Only the creator can edit this leave request", 403);
      const data = pick(input);
      const startDate = data.start_date ?? request.start_date;
      const endDate = data.end_date ?? request.end_date;
      if (endDate < startDate) fail("end_date must not be before start_date");
      if (
        data.duration === undefined &&
        (data.start_date !== undefined || data.end_date !== undefined)
      )
        data.duration = dayCount(startDate, endDate);
      if (data.id_employee !== undefined)
        data.id_department = await this.employeeDepartment(data.id_employee, t1);
      await mirrorUpdate("LeaveRequest", id, data, t1, t2);
      await this.syncAttachments(id, input, userId, t1, t2);
      await this.addProgress(id, userId, "edited", "Leave request edited", t1, t2);
    });
    return this.getById(id);
  }

  // Adds files to files_attachment, keeping the ones already there (syncFiles would
  // drop every file not sent again).
  async appendAttachments(id, files, userId, t1, t2) {
    for (const file of files)
      await mirrorCreate(
        "File",
        {
          fileable_type: "leave_requests",
          fileable_id: id,
          category: "files_attachment",
          original_name: file.original_name,
          indonesian_name: file.indonesian_name ?? file.original_name,
          mandarin_name: file.mandarin_name ?? file.original_name,
          stored_name: file.stored_name,
          url: file.url,
          mime_type: file.mime_type,
          size: file.size,
          uploaded_by: userId,
          is_active: true,
        },
        t1,
        t2,
      );
  }

  // decision: "approve" or "reject"; stage: one of STAGES. data: { note }. For a
  // request created with a referral letter, the director's approval sends it back
  // to the requester for the doctor's letter instead of approving it.
  async decide(id, stage, decision, userId, data, isDoubleDatabase = true) {
    const { note } = data ?? {};
    if (!STAGES.includes(stage)) fail("Invalid stage");
    if (!["approve", "reject"].includes(decision)) fail("Invalid decision");
    if (decision === "reject" && !note?.trim())
      fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const request = await this.lock(id, t1);
      if (request.status !== `request ${stage}`)
        fail(`Action is not allowed from status "${request.status}"`, 409);
      const update = {
        status: decision === "approve" ? NEXT_STATUS[stage] : `rejected ${stage}`,
      };
      if (
        decision === "approve" &&
        stage === "director" &&
        request.sick_letter_status === "referral letter"
      )
        update.status = "request doctor letter";
      await mirrorUpdate("LeaveRequest", id, update, t1, t2);
      const action = decision === "approve" ? "approved" : "rejected";
      await this.addProgress(id, userId, `${action} ${stage}`, note, t1, t2);
    });
    return this.getById(id);
  }

  // The requester uploads the doctor's letter (SKD) for a request created with a
  // referral letter. The files are added to files_attachment and the request goes
  // to HR verification.
  async submitDoctorLetter(id, userId, data = {}, isDoubleDatabase = true) {
    if (!Array.isArray(data.files_attachment) || !data.files_attachment.length)
      fail("files_attachment must contain the doctor's letter (SKD)");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const request = await this.lock(id, t1);
      if (request.status !== "request doctor letter")
        fail(`Action is not allowed from status "${request.status}"`, 409);
      if (request.id_user_request !== userId)
        fail("Only the creator can submit the doctor's letter", 403);
      await this.appendAttachments(id, data.files_attachment, userId, t1, t2);
      await mirrorUpdate(
        "LeaveRequest",
        id,
        { status: "request verification hr" },
        t1,
        t2,
      );
      await this.addProgress(id, userId, "doctor letter submitted", data.note, t1, t2);
    });
    return this.getById(id);
  }

  // Admin/SPV HR verifies the doctor's letter the requester uploaded; nothing is
  // uploaded here. The request becomes approved.
  async verifyHr(id, userId, data = {}, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const request = await this.lock(id, t1);
      if (request.status !== "request verification hr")
        fail(`Action is not allowed from status "${request.status}"`, 409);
      await mirrorUpdate("LeaveRequest", id, { status: "approved" }, t1, t2);
      await this.addProgress(id, userId, "verified hr", data.note, t1, t2);
    });
    return this.getById(id);
  }
}

module.exports = new LeaveRequestService();
module.exports.dayCount = dayCount;
