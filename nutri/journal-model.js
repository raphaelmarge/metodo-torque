// Pure adapters for the existing save_food_journal RPC. No persistence or XP.
// SQL: 20261008040149 (plan snapshots), 20261008040817 (journal validation).
const MACROS = ['k', 'pt', 'cb', 'g'];
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const length = value => [...value].length;
const validVersion = value => Number.isInteger(value) && value >= 1 && value <= 1000000;
const validMealId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const visibleToPatient = (record, patientId, kind) => Boolean(patientId) && object(record)
  && record.patient_id === patientId && record.kind === kind && record.visibility === 'patient'
  && !record.archived && !record.data?.archived;

/**
 * New reports use the published plan. Edits retain their recorded version and
 * meal ID, even if that meal no longer exists. Only an authorized historical
 * snapshot may provide the plan for an edit; current-plan macros never fill it.
 * Inputs are full plan/patient_records rows. Missing reference fields mean null.
 */
export function resolveJournalPlan({published, records = [], patientId, existing} = {}) {
  if (!existing) {
    const usable = Boolean(patientId) && object(published) && published.patient_id === patientId
      && published.status === 'published' && validVersion(published.version) && object(published.data);
    return {plan: usable ? structuredClone(published.data) : null,
      planVersion: usable ? published.version : null, mealId: null, lockedToHistory: false};
  }
  if (!visibleToPatient(existing, patientId, 'food_journal') || !object(existing.data)) {
    throw Error('Registro alimentar indisponível para este paciente.');
  }
  const planVersion = existing.data.planVersion ?? null;
  const mealId = existing.data.mealId ?? null;
  if (planVersion !== null && !validVersion(planVersion)) throw Error('Versão histórica do plano inválida.');
  if (mealId !== null && !validMealId(mealId)) throw Error('Identificador histórico da refeição inválido.');
  // Published IDs are stable in publish_patient_plan; do not mix plan rows that
  // happen to share a version number. With no current plan, require uniqueness.
  const planId = published?.patient_id === patientId && published?.status === 'published' ? published.id : null;
  const matches = (Array.isArray(records) ? records : []).filter(record =>
    planVersion !== null && visibleToPatient(record, patientId, 'plan_version')
    && object(record.data) && record.data.planVersion === planVersion && object(record.data.plan)
    && (!planId || record.data.planId === planId));
  return {plan: matches.length === 1 ? structuredClone(matches[0].data.plan) : null,
    planVersion, mealId, lockedToHistory: true};
}

function text(value, max, field) {
  if (typeof value !== 'string') throw Error(`${field} inválido.`);
  const normalized = value.trim();
  if (!normalized || length(normalized) > max) throw Error(`${field} deve ter entre 1 e ${max} caracteres.`);
  return normalized;
}

function quantity(value) {
  let parsed = value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
      throw Error('Quantidade deve ser positiva e até 1000 porções.');
    }
    parsed = Number(normalized.replace(',', '.'));
  }
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0 || parsed > 1000) {
    throw Error('Quantidade deve ser positiva e até 1000 porções.');
  }
  return parsed;
}

/**
 * rows: {id?, nome, qtd, porcao, source?}. The caller provides IDs for new rows;
 * old IDs remain unchanged. source is the exact selected historical/plan item,
 * not a food found by name. Macros are per portion, so changing qtd does not
 * scale these fields. Each known valid macro is preserved independently;
 * missing/invalid fields remain absent, never zero. An explicit legacy source
 * without an ID can match a row without an ID; this helper never invents IDs.
 * Portion labels are <=100 characters, matching the existing RPC (not 200).
 */
export function buildJournalItems(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw Error('Informe entre 1 e 100 alimentos consumidos.');
  }
  return rows.map(row => {
    if (!object(row)) throw Error('Alimento inválido.');
    const item = {nome: text(row.nome, 200, 'Nome do alimento'), qtd: quantity(row.qtd),
      porcao: text(row.porcao, 100, 'Porção do alimento')};
    if (row.id !== undefined) {
      if (typeof row.id !== 'string' || length(row.id) < 1 || length(row.id) > 160) {
        throw Error('Identificador do alimento inválido.');
      }
      item.id = row.id;
    }
    const source = row.source;
    const sameItem = object(source) && source.id === item.id
      && source.nome === item.nome && source.porcao === item.porcao;
    if (sameItem) for (const key of MACROS) {
      if (Object.hasOwn(source, key) && typeof source[key] === 'number'
        && Number.isFinite(source[key]) && source[key] >= 0 && source[key] <= 100000) {
        item[key] = source[key];
      }
    }
    return item;
  });
}

const timestamp = value => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};
function moreRecent(a, b) {
  const updatedA = timestamp(a.updated_at), updatedB = timestamp(b.updated_at);
  const aTime = Number.isFinite(updatedA) ? updatedA : timestamp(a.created_at);
  const bTime = Number.isFinite(updatedB) ? updatedB : timestamp(b.created_at);
  if (aTime !== bTime) return aTime > bTime;
  const aCreated = timestamp(a.created_at), bCreated = timestamp(b.created_at);
  if (aCreated !== bCreated) return aCreated > bCreated;
  return String(a.id || '').localeCompare(String(b.id || '')) > 0;
}

/** Last exact patient-visible report, without mutating records. null versions
 * and absent legacy versions are the same unversioned reference, never current.
 * Authorization of the author's edit still belongs to save_food_journal.
 */
export function findJournalForMeal({records = [], patientId, day, mealId, planVersion} = {}) {
  if (!patientId || typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
    || !validMealId(mealId) || (planVersion != null && !validVersion(planVersion))) return null;
  const version = planVersion ?? null;
  return (Array.isArray(records) ? records : []).reduce((latest, record) => {
    if (!visibleToPatient(record, patientId, 'food_journal') || !object(record.data)
      || record.data.day !== day || record.data.mealId !== mealId
      || (record.data.planVersion ?? null) !== version) return latest;
    return !latest || moreRecent(record, latest) ? record : latest;
  }, null);
}
