const STORAGE_PREFIX = "gla:v1:";

function safeGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // localStorage unavailable (private mode, quota, etc.) — game still
    // works for the session, it just won't persist across reloads.
  }
}

function loadProgress(date) {
  const stored = safeGet(STORAGE_PREFIX + "progress:" + date);
  if (stored && stored.date === date) return stored;
  return { date, levelResults: [null, null, null], currentLevel: 0, completed: false };
}

function saveProgress(progress) {
  safeSet(STORAGE_PREFIX + "progress:" + progress.date, progress);
}

function loadStreak() {
  return safeGet(STORAGE_PREFIX + "streak") || { count: 0, lastCompletedDate: null };
}

function saveStreak(streak) {
  safeSet(STORAGE_PREFIX + "streak", streak);
}

// Called once, when a day's 3rd level completes. Idempotent: replaying this
// for a date that's already been counted is a no-op, so main.js doesn't need
// its own re-entrancy guard.
function recordDayCompletion(date) {
  const streak = loadStreak();
  if (streak.lastCompletedDate === date) return streak;

  if (streak.lastCompletedDate === null) {
    streak.count = 1;
  } else {
    const diff = istDaysBetween(streak.lastCompletedDate, date);
    streak.count = diff === 1 ? streak.count + 1 : 1;
  }
  streak.lastCompletedDate = date;
  saveStreak(streak);
  return streak;
}
