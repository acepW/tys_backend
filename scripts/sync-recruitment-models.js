// Creates the recruitment tables in foreign-key order. Existing tables are left intact.
const { syncModel, db1, db2 } = require("../src/models");

const recruitmentModels = [
  "RecruitmentRequest",
  "RecruitmentCandidate",
  "RecruitmentHrInterview",
  "RecruitmentUserInterview",
  "RecruitmentOffering",
  "RecruitmentContract",
  "RecruitmentVerificationProgress",
];

const run = async () => {
  try {
    for (const modelName of recruitmentModels) await syncModel(modelName, "both", {});
    console.log("Recruitment tables synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
