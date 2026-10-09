// These summaries describe recorded care, never inferred dietary adherence.
// XP is recomputed from the current records; it is not an immutable ledger.
export const CARE_POLICY_START = '2026-10-09';
const MOODS = new Set(['great', 'good', 'neutral', 'low', 'bad']);
const array = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const ids = value => [...new Set(array(value).map(text).filter(Boolean))];

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function validTarget(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !validDay(value.slice(0, 10))) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}
function localDay(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function revision(row) {
  return [Number.isInteger(row?.version) ? row.version : 0,
    timestamp(row?.updated_at) ?? timestamp(row?.created_at) ?? 0];
}
function latestRecords(records, patientId) {
  const map = new Map();
  for (const row of array(records)) {
    if (!row || row.patient_id !== patientId || !text(row.id)) continue;
    const previous = map.get(row.id), a = revision(row), b = revision(previous);
    if (!previous || a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1])) map.set(row.id, row);
  }
  return [...map.values()].filter(row => row.visibility === 'patient' && row.data &&
    typeof row.data === 'object' && !Array.isArray(row.data) && !row.data.archived && !row.archived);
}
function journals(records, patientId, day) {
  return latestRecords(records, patientId).filter(row => row.kind === 'food_journal' &&
    validDay(row.data.day) && (!day || row.data.day === day) &&
    array(row.data.items).some(item => item && text(item.nome) && positive(item.qtd)))
    .sort((a, b) => a.data.day.localeCompare(b.data.day) || String(a.id).localeCompare(String(b.id)));
}
function dayLogs(logs, patientId, day) {
  return array(logs).filter(row => row && row.patient_id === patientId && validDay(row.day) && row.day === day && !row.archived);
}
function hasCheckIn(row) {
  return MOODS.has(row.mood) || (typeof row.sleep === 'number' && Number.isFinite(row.sleep) && row.sleep >= 0 && row.sleep <= 24) || !!text(row.note);
}
function samePlanVersion(entryVersion, planVersion) {
  if (planVersion === undefined) return true;
  return entryVersion != null && planVersion != null && String(entryVersion) === String(planVersion);
}

/**
 * A meal marker and a journal for the same day/meal count once. Journals from
 * another published version remain historical care but never mark this plan.
 * entries contains all valid visible journals for this day, including history.
 */
export function mealPresence({patientId, day, logs = [], records = [], planVersion} = {}) {
  if (!patientId || !validDay(day)) return {mealIds: [], entries: [], count: 0};
  const mealIds = new Set(dayLogs(logs, patientId, day).flatMap(row => ids(row.meals)));
  const countKeys = new Set([...mealIds].map(id => 'meal:' + id));
  const entries = journals(records, patientId, day);
  const exactMealIds = new Set(), differentVersionMealIds = new Set();
  for (const entry of entries) {
    const mealId = text(entry.data.mealId);
    if (mealId) {
      // Version changes do not turn a marker and its report into two care
      // actions. The version controls current-plan presence, not care count.
      countKeys.add('meal:' + mealId);
      if (samePlanVersion(entry.data.planVersion, planVersion)) {
        mealIds.add(mealId);
        exactMealIds.add(mealId);
      } else differentVersionMealIds.add(mealId);
    } else countKeys.add('entry:' + entry.id);
  }
  if (planVersion !== undefined) {
    // A bare legacy marker has no version to infer. Only an actual report of
    // a different version supplies evidence that it should stay historical.
    for (const mealId of differentVersionMealIds) {
      if (!exactMealIds.has(mealId)) mealIds.delete(mealId);
    }
  }
  return {mealIds: [...mealIds].sort(), entries, count: countKeys.size};
}

/**
 * days/followedDays are counts in the current Monday–today week. xp and
 * mealCount cover the available history. dayXP is today's numeric XP;
 * careDays is a sorted array of ISO dates. goalOrigin is personal or clinic.
 */
export function careSummary({patientId, logs = [], records = [], today, clinicGoal} = {}) {
  if (!validDay(today)) throw new TypeError('Informe today como uma data ISO válida.');
  const visible = patientId ? latestRecords(records, patientId) : [];
  const goals = visible.filter(row => row.kind === 'goal_update' && validTarget(row.data.target) &&
    timestamp(row.updated_at || row.created_at) != null &&
    localDay(new Date(timestamp(row.updated_at || row.created_at))) <= today &&
    (!Object.hasOwn(row.data, 'day') || (validDay(row.data.day) && row.data.day <= today)))
    .sort((a, b) => (timestamp(b.updated_at || b.created_at) - timestamp(a.updated_at || a.created_at)) ||
      String(b.id).localeCompare(String(a.id)));
  const goal = goals[0];
  const target = goal?.data.target ?? (validTarget(clinicGoal) ? clinicGoal : 5);
  const goalOrigin = goal ? 'personal' : 'clinic';
  const groups = new Map();
  for (const row of array(logs)) {
    if (!patientId || !row || row.patient_id !== patientId || !validDay(row.day) || row.day > today || row.archived) continue;
    if (!groups.has(row.day)) groups.set(row.day, []);
    groups.get(row.day).push(row);
  }
  for (const entry of journals(visible, patientId)) {
    if (entry.data.day <= today && !groups.has(entry.data.day)) groups.set(entry.data.day, []);
  }
  const careDays = [], followed = [], points = new Map();
  let mealCount = 0;
  for (const [day, rows] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const presence = mealPresence({patientId, day, logs: rows, records: visible});
    const followedDay = rows.some(row => row.followed === true);
    const waterDay = rows.some(row => positive(row.water_ml));
    const weightDay = rows.some(row => positive(row.weight));
    const checkIn = rows.some(hasCheckIn);
    const foodDay = presence.count > 0;
    const care = followedDay || waterDay || checkIn || foodDay || (day < CARE_POLICY_START && weightDay);
    if (care) careDays.push(day);
    if (followedDay) followed.push(day);
    mealCount += presence.count;
    // Legacy XP never awarded points for a journal alone or for a check-in.
    const legacyMealCount = new Set(rows.flatMap(row => ids(row.meals))).size;
    const xp = day < CARE_POLICY_START
      ? (followedDay ? 10 : 0) + (weightDay ? 5 : 0) + (waterDay ? 2 : 0) + legacyMealCount * 2
      : (waterDay || checkIn || foodDay ? 10 : 0) + (checkIn ? 5 : 0) + (foodDay ? 5 : 0);
    points.set(day, xp);
  }
  const monday = new Date(today + 'T12:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const firstDay = monday.toISOString().slice(0, 10);
  return {
    days: careDays.filter(day => day >= firstDay).length,
    target, goalOrigin,
    followedDays: followed.filter(day => day >= firstDay).length,
    xp: [...points.values()].reduce((sum, value) => sum + value, 0),
    dayXP: points.get(today) || 0,
    lastCareDay: careDays.at(-1) || null,
    mealCount, careDays
  };
}

function mealMinutes(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function includesDay(days, weekday) {
  if (!Array.isArray(days) || !days.length) return true;
  const numeric = days.filter(value => Number.isInteger(value) && value >= 0 && value <= 6);
  // Human-readable context such as "dias de trabalho" is never interpreted.
  return !numeric.length || numeric.includes(weekday);
}

/**
 * Suggest a pending meal within 60 minutes before / 120 minutes after its
 * scheduled time. Upcoming takes priority over older pending meals. endOn is
 * a review date and never expires the plan. now accepts Date or local HH:MM.
 * Returns {meal: original meal or null, state, reason}; does not mutate plan.
 */
export function nextMeal({plan, day, now, recordedMealIds = []} = {}) {
  const result = (state, reason, meal = null) => ({meal, state, reason});
  if (!validDay(day)) return result('none', 'invalid-day');
  if (!plan || typeof plan !== 'object') return result('none', 'no-plan');
  if (plan.ativo === false) return result('none', 'inactive-plan');
  const start = validDay(plan.startOn) ? plan.startOn : validDay(plan.inicio) ? plan.inicio : null;
  if (start && start > day) return result('not-started', 'future-start');
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  if (!includesDay(plan.dias, weekday)) return result('none', 'no-meals-today');
  const meals = array(plan.refeicoes).filter(meal => meal && typeof meal === 'object' && includesDay(meal.dias, weekday));
  if (!meals.length) return result('none', 'no-meals-today');
  const recorded = new Set(ids(recordedMealIds));
  const pending = meals.filter(meal => !recorded.has(text(meal.id)));
  if (!pending.length) return result('none', 'all-recorded');
  let minutes;
  if (now instanceof Date && Number.isFinite(now.valueOf())) {
    if (localDay(now) !== day) return result('none', 'different-day');
    minutes = now.getHours() * 60 + now.getMinutes();
  } else minutes = mealMinutes(now);
  if (minutes == null) return result('none', 'invalid-time');
  const timed = pending.map((meal, index) => ({meal, index, time: mealMinutes(meal.hora)}))
    .filter(entry => entry.time != null).sort((a, b) => a.time - b.time || a.index - b.index);
  const upcoming = timed.find(entry => entry.time >= minutes && entry.time - minutes <= 60);
  if (upcoming) return result(upcoming.time === minutes ? 'ready' : 'upcoming', 'scheduled-window', upcoming.meal);
  const recent = timed.filter(entry => entry.time < minutes && minutes - entry.time <= 120)
    .sort((a, b) => b.time - a.time || a.index - b.index)[0];
  if (recent) return result('ready', 'scheduled-window', recent.meal);
  const untimed = pending.find(meal => mealMinutes(meal.hora) == null);
  if (untimed) return result('ready', 'without-time', untimed);
  return result('none', 'outside-window');
}
