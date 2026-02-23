const SHEET_NAME = "Sheet1";
const SCRIPT_URL = ""; // Not needed in Apps Script

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "lookupGuest")     return lookupGuest(data.name, data.forcedHouseholdId);
    if (action === "submitRSVP")      return submitRSVP(data);
    if (action === "submitQuiz")      return submitQuiz(data.householdId, data.score, data.answers);
    if (action === "getLeaderboard")  return getLeaderboard();

    return response({ success: false, error: "Unknown action" });
  } catch (err) {
    return response({ success: false, error: err.message });
  }
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === "getLeaderboard") return getLeaderboard();
  return response({ success: false, error: "Use POST" });
}

function getSheet() {
  const ss = SpreadsheetApp.openById("1TJ_J5JGQ2QTy1zInB6ce2w3r7RnQtkIFOC2hcEt7nOg");
  return ss.getSheetByName(SHEET_NAME);
}

function getAllData() {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  return rows.slice(1).map((row, i) => {
    const obj = {};
    headers.forEach((h, j) => obj[h] = row[j]);
    obj._row = i + 2;
    return obj;
  });
}

function normalizeName(name) {
  return String(name).trim().toLowerCase();
}

function lookupGuest(inputName, forcedHouseholdId) {
  const normalized = normalizeName(inputName);
  const data = getAllData();

  let matches;

  if (forcedHouseholdId) {
    // Disambiguation selection — return that specific household
    matches = data.filter(r => String(r["Household ID"]) === String(forcedHouseholdId));
  } else {
    matches = data.filter(row => {
      return (
        normalizeName(row["Full Name"]    || "") === normalized ||
        normalizeName(row["Nickname 1"]   || "") === normalized ||
        normalizeName(row["Nickname 2"]   || "") === normalized
      );
    });
  }

  if (matches.length === 0) {
    return response({ success: false, error: "not_found" });
  }

  const householdIds = [...new Set(matches.map(m => m["Household ID"]))];

  if (!forcedHouseholdId && householdIds.length > 1) {
    const households = householdIds.map(id => {
      const members = data.filter(r => r["Household ID"] === id);
      return { householdId: id, displayName: members[0]["Display Name"] };
    });
    return response({ success: true, status: "disambiguation", households });
  }

  return resolveHousehold(householdIds[0], data, inputName);
}

function resolveHousehold(householdId, data, inputName) {
  const members = data.filter(r => String(r["Household ID"]) == String(householdId));
  const quizStatus = members[0]["Quiz Status"] || "Not Started";
  const quizAnswers = members[0]["Quiz Answers"] || "";
  const quizScore = members[0]["Quiz Score"];

  const normalized = normalizeName(inputName);
  const matchedMember = members.find(m =>
    normalizeName(m["Full Name"]  || "") === normalized ||
    normalizeName(m["Nickname 1"] || "") === normalized ||
    normalizeName(m["Nickname 2"] || "") === normalized
  ) || members[0];

  const greeting = matchedMember["Nickname 1"] || matchedMember["Full Name"].split(" ")[0];

  return response({
    success: true,
    status: "found",
    householdId,
    greeting,
    displayName: members[0]["Display Name"],
    quizStatus,
    quizAnswers: quizAnswers ? quizAnswers.toString().split(",").map(Number) : [],
    quizScore,
    members: members.map(m => ({
      fullName: m["Full Name"],
      nickname: m["Nickname 1"],
      rsvpStatus: m["RSVP Status"],
      row: m._row
    }))
  });
}

function submitRSVP(data) {
  const sheet = getSheet();
  const { members, addedGuests } = data;

  members.forEach(m => {
    sheet.getRange(m.row, 6).setValue(m.rsvpStatus);
  });

  if (addedGuests && addedGuests.length > 0) {
    addedGuests.forEach(guest => {
      sheet.appendRow([
        guest.householdId,
        guest.displayName,
        guest.fullName,
        guest.fullName.split(" ")[0],
        "",
        guest.rsvpStatus,
        "No",
        "",
        "",
        "Not Started",
        ""
      ]);
    });
  }

  return response({ success: true });
}

function submitQuiz(householdId, score, answers) {
  const data = getAllData();
  const sheet = getSheet();
  const members = data.filter(r => String(r["Household ID"]) == String(householdId));

  members.forEach(m => {
    sheet.getRange(m._row, 8).setValue("Yes");        // Quiz Taken col H
    sheet.getRange(m._row, 9).setValue(score);         // Quiz Score col I
    sheet.getRange(m._row, 10).setValue("Complete");  // Quiz Status col J
    sheet.getRange(m._row, 11).setValue(answers || ""); // Quiz Answers col K
  });

  return response({ success: true });
}

function getLeaderboard() {
  const data = getAllData();
  const seen = new Set();
  const leaderboard = [];

  data.forEach(row => {
    const id = row["Household ID"];
    if (!seen.has(id) && row["Quiz Taken"] === "Yes") {
      seen.add(id);
      leaderboard.push({
        displayName: row["Display Name"],
        score: row["Quiz Score"]
      });
    }
  });

  leaderboard.sort((a, b) => b.score - a.score);
  return response({ success: true, leaderboard });
}

function response(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testLookup() {
  const result = lookupGuest("Dale Mennemeyer");
  Logger.log(JSON.stringify(result));
}
