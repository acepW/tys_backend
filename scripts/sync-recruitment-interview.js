// Recruitment hiring status and interview report master (2026-11-24,
// docs/recruitment-interview-requirement.md, fase H-A and H-B), in DB1 and DB2.
// Safe to run more than once:
//   1. recruitment_candidates gets hiring_status_updated_at, birth_date,
//      birth_place and address.
//   2. Candidates whose hiring_status is empty or not one of the 15 values get one
//      from their latest step (H17): contract → work contract; offering → offering
//      letter; user interview → offering letter / user interview rejected / user
//      interview; HR interview → user interview / hr interview rejected / hr
//      interview; otherwise contacting. The change is written to the candidate's
//      history. Then hiring_status becomes the ENUM of the model (NOT NULL).
//   3. Creates recruitment_report_items and, when it is empty, fills it with the
//      items of the client's "Laporan Interview HR" form.
//   4. Fase H-C: recruitment_hr_interviews gets the schedule, interviewer,
//      attendance, recommendation, description and result columns; its status
//      gains scheduled / no show / completed and decision becomes nullable;
//      recruitment_psychotests and recruitment_interview_scores are created. Old
//      interviews move to the new form (H13, H17): approved → completed and
//      attended, passed → recommended, not passed → not recommended, the HR
//      interview text → description, the psychotest text → one psychotest row;
//      pending → scheduled; the schedule is copied from the candidate. The
//      "recruitment hr interview" approval flows are deactivated (H14).
//   5. Fase H-D: recruitment_user_interviews gets result, consideration_due_date
//      and result_at; its status gains scheduled / no show / completed and
//      decision becomes nullable; recruitment_user_interviewers is created. Old
//      user interviews get one interviewer, their creator (H17): approved →
//      completed and attended, with its decision as the interviewer's and the
//      result, the assessment → description; pending → scheduled; the schedule is
//      copied from the candidate. The "recruitment user interview" approval flows
//      are deactivated (H14).
const { models, db1, db2 } = require("../src/models");
const {
  CANDIDATE_HIRING_STATUSES,
} = require("../src/models/humanResource/recruitment/recruitmentCandidate.model");

const databases = [["db1", models.db1], ["db2", models.db2]];

async function addColumns(name, db) {
  const queryInterface = db.RecruitmentCandidate.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("recruitment_candidates");
  for (const column of ["hiring_status_updated_at", "birth_date", "birth_place", "address"]) {
    if (columns[column]) continue;
    await queryInterface.addColumn("recruitment_candidates", column, db.RecruitmentCandidate.rawAttributes[column]);
    console.log(`[${name}] + recruitment_candidates.${column}`);
  }
}

// Latest active document of a step per candidate.
async function latestByCandidate(Model) {
  const rows = await Model.findAll({ where: { is_active: true }, order: [["id", "ASC"]], raw: true });
  return new Map(rows.map((row) => [row.id_recruitment_candidate, row]));
}

// Hiring status from the latest step a candidate reached (H17), read from DB1.
async function derivedStatuses() {
  const db = models.db1;
  const [hr, user, offering, contract] = await Promise.all([
    latestByCandidate(db.RecruitmentHrInterview),
    latestByCandidate(db.RecruitmentUserInterview),
    latestByCandidate(db.RecruitmentOffering),
    latestByCandidate(db.RecruitmentContract),
  ]);
  const status = (id) => {
    if (contract.has(id)) return "work contract";
    if (offering.has(id)) return "offering letter";
    const userInterview = user.get(id);
    if (userInterview) {
      if (userInterview.status === "no show") return "user interview no show";
      if (userInterview.status === "completed")
        return { accepted: "offering letter", considered: "user interview consideration" }[userInterview.result]
          ?? "user interview rejected";
      if (userInterview.status !== "approve") return "user interview";
      return userInterview.decision === "accepted" ? "offering letter" : "user interview rejected";
    }
    const hrInterview = hr.get(id);
    if (hrInterview) {
      if (hrInterview.status === "no show") return "hr interview no show";
      if (hrInterview.status === "completed")
        return hrInterview.recommendation === "recommended" ? "user interview" : "hr interview rejected";
      if (hrInterview.status !== "approve") return "hr interview";
      return hrInterview.decision === "passed" ? "user interview" : "hr interview rejected";
    }
    return "contacting";
  };
  return status;
}

// History rows written by the migration, by candidate id: DB2 reuses DB1's ids so
// both databases keep the same rows.
const historyIds = new Map();

async function fillHiringStatus(name, db, statusOf) {
  const queryInterface = db.RecruitmentCandidate.sequelize.getQueryInterface();
  const rows = await db.RecruitmentCandidate.sequelize.query(
    "SELECT id, hiring_status, id_user_request FROM recruitment_candidates",
    { type: "SELECT" },
  );
  let filled = 0;
  for (const row of rows) {
    if (CANDIDATE_HIRING_STATUSES.includes(row.hiring_status)) continue;
    const next = statusOf(row.id);
    await db.RecruitmentCandidate.sequelize.query(
      "UPDATE recruitment_candidates SET hiring_status = ?, hiring_status_updated_at = NOW() WHERE id = ?",
      { replacements: [next, row.id] },
    );
    const history = await db.RecruitmentVerificationProgress.create({
      ...(name === "db2" && historyIds.has(row.id) && { id: historyIds.get(row.id) }),
      module: "candidate",
      id_document: row.id,
      id_user: row.id_user_request,
      status: `hiring status ${next}`,
      note: `Hiring status ${row.hiring_status || "(none)"} → ${next}: filled by the migration from the candidate's latest step`,
    });
    if (name === "db1") historyIds.set(row.id, history.id);
    filled++;
  }
  if (filled) console.log(`[${name}] hiring status filled for ${filled} candidate(s)`);
  const columns = await queryInterface.describeTable("recruitment_candidates");
  if (!columns.hiring_status.type.toLowerCase().includes("enum")) {
    const attribute = db.RecruitmentCandidate.rawAttributes.hiring_status;
    await queryInterface.changeColumn("recruitment_candidates", "hiring_status", {
      type: attribute.type,
      allowNull: attribute.allowNull,
      defaultValue: attribute.defaultValue,
      comment: attribute.comment,
    });
    console.log(`[${name}] ~ recruitment_candidates.hiring_status is now the 15-value ENUM`);
  }
}

// Laporan Interview HR (client form, 2026-11-24). * items are optional (H8).
const GROUP_1 = "Menggambarkan bagaimana kandidat berperilaku di situasi kerja sehari-hari dan saat berinteraksi dengan rekan kerja.";
const GROUP_2 = "Menggambarkan bagaimana kandidat bereaksi saat menghadapi tuntutan tinggi, tekanan waktu, atau konflik kerja.";
const GROUP_3 = "Menggambarkan persepsi kandidat terhadap dirinya sendiri, nilai-nilai pribadi, dan cara ia ingin dilihat oleh orang lain.";
const REPORT_ITEMS = [
  ...[
    ["Respon terhadap Lingkungan dan Jobdesk (Grafik I)", GROUP_1, [
      "Adaptasi terhadap aturan & prosedur kerja",
      "Cara berkomunikasi dan berinteraksi",
      "Kemampuan bekerja sesuai peran & tanggung jawab",
      "Fleksibilitas terhadap lingkungan kerja",
    ]],
    ["Respon terhadap Kondisi Tekanan / Stres Kerja (Grafik II)", GROUP_2, [
      "Kemampuan menjaga emosi & kestabilan diri",
      "Pengambilan keputusan di bawah tekanan",
      "Ketahanan terhadap beban kerja & stres",
      "Kemampuan beradaptasi terhadap situasi mendadak",
    ]],
    ["Respon terhadap Diri / Self Image (Grafik III)", GROUP_3, [
      "Rasa percaya diri dan keyakinan terhadap kemampuan",
      "Kemandirian dan tanggung jawab pribadi",
      "Konsistensi antara perilaku dan nilai pribadi",
      "Orientasi terhadap pengembangan diri",
    ]],
  ].flatMap(([group, groupDescription, items]) =>
    items.map((item) => ({ section: "Gaya Kerja", group_name: group, group_description: groupDescription, item_name: item }))),
  ...[
    ["Produktivitas", "Menunjukkan kemampuan menjaga kuantitas penyelesaian pekerjaan dalam satu waktu dengan ritme yang konsisten"],
    ["Ketelitian kerja", "Mencerminkan tingkat kehati-hatian dalam bekerja yang terlihat dari minimnya kesalahan selama proses penyelesaian tugas."],
    ["Konsistensi", "Menggambarkan kestabilan performa kerja saat menghadapi tekanan maupun tuntutan pekerjaan yang berkelanjutan."],
    ["Daya Tahan dan Ketekunan", "Menunjukkan kemampuan mempertahankan fokus dan produktivitas dalam mengerjakan tugas yang bersifat monoton dalam jangka waktu tertentu."],
  ].map(([item, description]) => ({ section: "Pola Kerja", item_name: item, item_description: description, is_optional: true })),
  ...[
    ["Pendidikan Formal", "Kesesuaian antara berbagai hal yang pernah ditangani dalam pekerjaan sebelumnya dengan pekerjaan yang dilamar"],
    ["Pengetahuan Umum", "Luasnya wawasan berpikir, pemahaman terhadap kejadian di sekitarnya, terutama yang berhubungan dengan bidang pekerjaan yang diminati"],
    ["Pengalaman Kerja", "Kesesuaian antara berbagai hal yang pernah ditangani dalam pekerjaan sebelumnya dengan pekerjaan yang dilamar"],
    ["Pengetahuan Teknis", "Kemampuan mengenal posisi yang dilamar sehubas pengetahuan konseptual atau teoritis"],
    ["Keterampilan Teknis", "Kemampuan mengatasi permasalahan yang mungkin terjadi pada bidang yang dilamar"],
    ["Motivasi", "Menunjukkan besarnya semangat serta minat terhadap posisi yang dilamar"],
    ["Kemampuan Komunikasi", "Kemampuan mengucapkan ide secara sistematis dan jelas sehingga dapat dipahami dengan benar oleh orang lain"],
    ["Kepercayaan Diri", "Keyakinan akan kemampuan yang dimiliki."],
    ["Penyesuaian Diri", "Kemampuan untuk memahami tuntutan lingkungan serta bertingkah laku sesuai dengan kondisi"],
    ["Etika", "Menunjukan sikap sopan santun dalam bertutur kata maupun bertingkah laku."],
    ["Kerja Sama", "Kemampuan beradaptasi dan bekerja sama dengan rekan kerja."],
  ].map(([item, description]) => ({ section: "Hasil Interview", group_name: "Faktor Utama", item_name: item, item_description: description })),
  ...[
    ["Kemampuan Memimpin", "Kemampuan untuk mengorganisir orang lain dan anak buah yang berada di bawah jajarannya"],
    ["Kemampuan Bahasa Mandarin", "Kemampuan dalam berbahasa Mandarin yang dapat dipahami dengan benar oleh orang lain"],
  ].map(([item, description]) => ({ section: "Hasil Interview", group_name: "Faktor Lain", item_name: item, item_description: description, is_optional: true })),
];

async function seedReportItems() {
  for (const [, db] of databases) await db.RecruitmentReportItem.sync({ alter: false });
  if (await models.db1.RecruitmentReportItem.count()) return console.log("[db1/db2] report items already filled, skipped");
  for (const [index, item] of REPORT_ITEMS.entries()) {
    const data = {
      group_name: null,
      group_description: null,
      item_description: null,
      is_optional: false,
      ...item,
      sort_order: (index + 1) * 10,
      is_active: true,
    };
    const row = await models.db1.RecruitmentReportItem.create(data);
    await models.db2.RecruitmentReportItem.create({ ...data, id: row.id });
  }
  console.log(`[db1/db2] + ${REPORT_ITEMS.length} report items from Laporan Interview HR`);
}

const HR_INTERVIEW_COLUMNS = [
  "interview_date", "interview_time", "method", "meeting_room", "meeting_link", "id_user_interviewer",
  "attendance", "recommendation", "description", "id_user_result", "result_at",
];

async function migrateHrInterviewSchema(name, db) {
  const queryInterface = db.RecruitmentHrInterview.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("recruitment_hr_interviews");
  const attributes = db.RecruitmentHrInterview.rawAttributes;
  for (const column of HR_INTERVIEW_COLUMNS) {
    if (columns[column]) continue;
    await queryInterface.addColumn("recruitment_hr_interviews", column, attributes[column]);
    console.log(`[${name}] + recruitment_hr_interviews.${column}`);
  }
  if (!columns.status.type.toLowerCase().includes("'scheduled'")) {
    await queryInterface.changeColumn("recruitment_hr_interviews", "status", {
      type: attributes.status.type,
      allowNull: attributes.status.allowNull,
      defaultValue: attributes.status.defaultValue,
    });
    console.log(`[${name}] ~ recruitment_hr_interviews.status gains scheduled / no show / completed`);
  }
  if (!columns.decision.allowNull) {
    await queryInterface.changeColumn("recruitment_hr_interviews", "decision", {
      type: attributes.decision.type,
      allowNull: true,
      comment: attributes.decision.comment,
    });
    console.log(`[${name}] ~ recruitment_hr_interviews.decision is nullable`);
  }
  await db.RecruitmentPsychotest.sync({ alter: false });
  await db.RecruitmentInterviewScore.sync({ alter: false });
}

// Creates a row in DB1, then the same row with the same id in DB2.
async function mirrorCreate(modelName, data) {
  const row = await models.db1[modelName].create(data);
  await models.db2[modelName].create({ ...data, id: row.id });
  return row;
}

async function migrateOldHrInterviews() {
  const rows = await models.db1.RecruitmentHrInterview.findAll({
    where: { status: ["pending", "approve"], attendance: null },
    raw: true,
  });
  for (const row of rows) {
    const candidate = await models.db1.RecruitmentCandidate.findByPk(row.id_recruitment_candidate, { raw: true });
    const mechanism = candidate?.hr_interview_mechanism;
    const data = {
      interview_date: row.interview_date ?? candidate?.hr_interview_date ?? null,
      interview_time: row.interview_time ?? candidate?.hr_interview_time ?? null,
      method: row.method ?? (mechanism ? (/online/i.test(mechanism) ? "online" : "offline") : null),
      meeting_room: row.meeting_room ?? candidate?.hr_interview_meeting_room ?? null,
      meeting_link: row.meeting_link ?? candidate?.hr_interview_meeting_room_link ?? null,
      id_user_interviewer: row.id_user_interviewer ?? row.id_user_request,
    };
    if (row.status === "approve")
      Object.assign(data, {
        status: "completed",
        attendance: "attended",
        recommendation: row.decision === "passed" ? "recommended" : "not recommended",
        description: row.interview_result,
        id_user_result: row.id_user_request,
        result_at: row.updatedAt,
      });
    else data.status = "scheduled";
    for (const [, db] of databases) await db.RecruitmentHrInterview.update(data, { where: { id: row.id } });
    if (row.psychotest_result?.trim())
      await mirrorCreate("RecruitmentPsychotest", {
        id_recruitment_hr_interview: row.id,
        tool_name: "Psikotes (data lama)",
        description: row.psychotest_result,
        is_active: true,
      });
    await mirrorCreate("RecruitmentVerificationProgress", {
      module: "hr interview",
      id_document: row.id,
      id_user: row.id_user_request,
      status: "migrated",
      note: `Moved to the new HR interview form: ${row.status} → ${data.status}${
        data.recommendation ? ` (${data.recommendation})` : ""
      }; report scores are empty`,
    });
  }
  if (rows.length) console.log(`[db1/db2] ${rows.length} old HR interview(s) moved to the new form`);
  for (const [name, db] of databases) {
    const [result] = await db.RecruitmentHrInterview.sequelize.query(
      "UPDATE approval_flows SET is_active = 0 WHERE approval_for = 'recruitment hr interview' AND is_active = 1",
    );
    if (result.affectedRows) console.log(`[${name}] ~ approval_flows: recruitment hr interview deactivated (${result.affectedRows})`);
  }
}

async function migrateUserInterviewSchema(name, db) {
  const queryInterface = db.RecruitmentUserInterview.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("recruitment_user_interviews");
  const attributes = db.RecruitmentUserInterview.rawAttributes;
  for (const column of ["result", "consideration_due_date", "result_at"]) {
    if (columns[column]) continue;
    await queryInterface.addColumn("recruitment_user_interviews", column, attributes[column]);
    console.log(`[${name}] + recruitment_user_interviews.${column}`);
  }
  if (!columns.status.type.toLowerCase().includes("'scheduled'")) {
    await queryInterface.changeColumn("recruitment_user_interviews", "status", {
      type: attributes.status.type,
      allowNull: attributes.status.allowNull,
      defaultValue: attributes.status.defaultValue,
    });
    console.log(`[${name}] ~ recruitment_user_interviews.status gains scheduled / no show / completed`);
  }
  if (!columns.decision.allowNull) {
    await queryInterface.changeColumn("recruitment_user_interviews", "decision", {
      type: attributes.decision.type,
      allowNull: true,
      comment: attributes.decision.comment,
    });
    console.log(`[${name}] ~ recruitment_user_interviews.decision is nullable`);
  }
  await db.RecruitmentUserInterviewer.sync({ alter: false });
}

async function migrateOldUserInterviews() {
  const rows = await models.db1.RecruitmentUserInterview.findAll({
    where: { status: ["pending", "approve"] },
    raw: true,
  });
  for (const row of rows) {
    if (await models.db1.RecruitmentUserInterviewer.count({ where: { id_recruitment_user_interview: row.id } })) continue;
    const candidate = await models.db1.RecruitmentCandidate.findByPk(row.id_recruitment_candidate, { raw: true });
    const creator = await models.db1.User.findByPk(row.id_user_request, {
      attributes: ["id"],
      include: [{ model: models.db1.Position, as: "position", attributes: ["position_name"] }],
    });
    const mechanism = candidate?.user_interview_mechanism;
    const approved = row.status === "approve";
    await mirrorCreate("RecruitmentUserInterviewer", {
      id_recruitment_user_interview: row.id,
      id_user: row.id_user_request,
      position_name: creator?.position?.position_name ?? null,
      interview_date: candidate?.user_interview_date ?? null,
      interview_time: candidate?.user_interview_time ?? null,
      method: mechanism ? (/online/i.test(mechanism) ? "online" : "offline") : null,
      attendance: approved ? "attended" : null,
      id_user_attendance: approved ? row.id_user_request : null,
      attendance_at: approved ? row.updatedAt : null,
      decision: approved ? row.decision : null,
      description: row.assessment,
      decided_at: approved ? row.updatedAt : null,
      is_active: row.is_active,
    });
    const data = approved
      ? { status: "completed", result: row.decision, result_at: row.updatedAt }
      : { status: "scheduled" };
    for (const [, db] of databases) await db.RecruitmentUserInterview.update(data, { where: { id: row.id } });
    await mirrorCreate("RecruitmentVerificationProgress", {
      module: "user interview",
      id_document: row.id,
      id_user: row.id_user_request,
      status: "migrated",
      note: `Moved to the new user interview form: ${row.status} → ${data.status}${
        data.result ? ` (${data.result})` : ""
      }; one interviewer (the creator), report scores are empty`,
    });
  }
  if (rows.length) console.log(`[db1/db2] ${rows.length} old user interview(s) moved to the new form`);
  for (const [name, db] of databases) {
    const [result] = await db.RecruitmentUserInterview.sequelize.query(
      "UPDATE approval_flows SET is_active = 0 WHERE approval_for = 'recruitment user interview' AND is_active = 1",
    );
    if (result.affectedRows) console.log(`[${name}] ~ approval_flows: recruitment user interview deactivated (${result.affectedRows})`);
  }
}

const run = async () => {
  try {
    // Schema first: the models read every column, and the scores refer to the report items.
    for (const [name, db] of databases) await addColumns(name, db);
    await seedReportItems();
    for (const [name, db] of databases) await migrateHrInterviewSchema(name, db);
    for (const [name, db] of databases) await migrateUserInterviewSchema(name, db);
    // Hiring status from the old steps, before they move to the new form.
    const statusOf = await derivedStatuses();
    for (const [name, db] of databases) await fillHiringStatus(name, db, statusOf);
    await migrateOldHrInterviews();
    await migrateOldUserInterviews();
    console.log("Recruitment interview sync finished");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
