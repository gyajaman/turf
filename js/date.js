// IST is a fixed UTC+5:30 offset with no DST, so this math never needs
// timezone-database lookups and is deterministic across every browser.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function getISTDateString(d = new Date()) {
  const istMs = d.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const ist = new Date(istMs);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateStrAsUTC(dateStr) {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  return Date.UTC(yyyy, mm - 1, dd);
}

function istDaysBetween(dateStrA, dateStrB) {
  const a = parseDateStrAsUTC(dateStrA);
  const b = parseDateStrAsUTC(dateStrB);
  return Math.round((b - a) / 86400000);
}
