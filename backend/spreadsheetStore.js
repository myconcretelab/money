const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const storePath = path.join(dataDir, 'spreadsheets.json');

/**
 * Lit le fichier de store et renvoie une forme normalisée.
 * Revient à des valeurs sûres si le fichier est absent ou corrompu.
 */
function readStore() {
  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      activeId: parsed.activeId || null,
      envDisabled: parsed.envDisabled === true,
      envCompact: parsed.envCompact === true,
    };
  } catch (error) {
    return { items: [], activeId: null, envDisabled: false, envCompact: false };
  }
}

/**
 * Persiste l'objet de store fourni sur le disque.
 */
function writeStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Normalise les spreadsheets personnalisés lus depuis le disque.
 * - Filtre les éléments faux/invalide
 * - Ignore l'id réservé `env`
 * - Force libellés, sources et drapeau compact par défaut
 */
function normalizeItems(items) {
  return (items || [])
    .filter(Boolean)
    .filter(item => item.id && item.spreadsheetId && item.id !== 'env')
    .map(item => ({
      id: item.id,
      spreadsheetId: item.spreadsheetId,
      label: item.label || 'Sans titre',
      source: item.source || 'custom',
      compact: item.compact === true,
    }));
}

/**
 * Construit la config complète utilisée par le module.
 * Combine le store persistant avec l'éventuel SPREAD_SHEET_ID de l'env,
 * impose l'unicité et détermine l'id de spreadsheet actif.
 */
function buildConfig() {
  const store = readStore();
  const envDisabled = store.envDisabled === true;
  const envCompact = store.envCompact === true;
  const envSpreadsheetId = process.env.SPREAD_SHEET_ID || null;
  const envEntry = envSpreadsheetId
    ? {
        id: 'env',
        spreadsheetId: envSpreadsheetId,
        label: 'SPREAD_SHEET_ID (env)',
        source: 'env',
        disabled: envDisabled,
        compact: envCompact,
      }
    : null;

  const customItems = normalizeItems(store.items);
  const items = envEntry ? [envEntry, ...customItems] : customItems;

  let activeId = envDisabled && store.activeId === 'env' ? null : store.activeId;
  const knownIds = new Set(items.map(item => item.id));
  if (activeId && !knownIds.has(activeId)) {
    activeId = envEntry && !envDisabled ? envEntry.id : null;
  }
  if (!activeId && envEntry && !envDisabled) {
    activeId = envEntry.id;
  }

  return { items, activeId, envSpreadsheetId, envDisabled, envCompact };
}

function getSpreadsheetConfig() {
  return buildConfig();
}

/**
 * Renvoie uniquement le spreadsheetId actif (ou null si rien n'est actif).
 */
function getActiveSpreadsheetId() {
  const { items, activeId } = buildConfig();
  if (!activeId) return null;
  const match = items.find(item => item.id === activeId);
  return match ? match.spreadsheetId : null;
}

/**
 * Vérifie que le spreadsheetId fourni n'est pas déjà utilisé par une autre entrée.
 * Lève une erreur en cas de doublon.
 */
function ensureUniqueSpreadsheetId(targetId, excludedId) {
  const { items } = buildConfig();
  if (items.some(item => item.spreadsheetId === targetId && item.id !== excludedId)) {
    throw new Error('Ce spreadsheetId est déjà enregistré.');
  }
}

/**
 * Ajoute un spreadsheet personnalisé au store.
 */
function addSpreadsheet({ spreadsheetId, label, compact }) {
  if (!spreadsheetId) throw new Error('spreadsheetId requis');
  ensureUniqueSpreadsheetId(spreadsheetId);
  const store = readStore();
  const newItem = {
    id: `custom-${Date.now()}`,
    spreadsheetId,
    label: label || 'Sans titre',
    source: 'custom',
    compact: compact === true,
  };
  store.items = normalizeItems([...store.items, newItem]);
  writeStore(store);
  return newItem;
}

/**
 * Met à jour un spreadsheet personnalisé stocké.
 * Celui issu de l'env ne peut pas être modifié.
 */
function updateSpreadsheet(id, { spreadsheetId, label, compact }) {
  if (id === 'env') throw new Error("Impossible de modifier le spreadsheet issu de l'environnement.");
  const store = readStore();
  const idx = store.items.findIndex(item => item.id === id);
  if (idx === -1) throw new Error('Spreadsheet introuvable.');

  if (spreadsheetId) {
    ensureUniqueSpreadsheetId(spreadsheetId, id);
  }

  const current = store.items[idx];
  const next = { ...current };
  if (spreadsheetId) next.spreadsheetId = spreadsheetId;
  if (label !== undefined) next.label = label || 'Sans titre';
  if (compact !== undefined) next.compact = Boolean(compact);

  store.items[idx] = next;
  writeStore(store);
  return next;
}

/**
 * Supprime un spreadsheet personnalisé et ajuste l'id actif si besoin.
 * Celui issu de l'env ne peut pas être supprimé.
 */
function deleteSpreadsheet(id) {
  if (id === 'env') throw new Error("Impossible de supprimer le spreadsheet de l'environnement.");
  const store = readStore();
  const exists = store.items.some(item => item.id === id);
  if (!exists) throw new Error('Spreadsheet introuvable.');
  store.items = normalizeItems(store.items.filter(item => item.id !== id));
  if (store.activeId === id) {
    store.activeId = (process.env.SPREAD_SHEET_ID && !store.envDisabled)
      ? 'env'
      : (store.items[0] && store.items[0].id) || null;
  }
  writeStore(store);
  return store.activeId || null;
}

/**
 * Définit un spreadsheet actif (ou le vide avec un id falsy).
 */
function setActiveSpreadsheet(id) {
  const { items } = buildConfig();
  if (id && !items.some(item => item.id === id)) {
    throw new Error('Spreadsheet introuvable.');
  }
  const store = readStore();
  store.activeId = id || null;
  writeStore(store);
  return store.activeId;
}

/**
 * Marque le spreadsheet env comme désactivé.
 */
function setEnvDisabled(disabled) {
  const store = readStore();
  store.envDisabled = !!disabled;
  if (store.envDisabled && store.activeId === 'env') {
    store.activeId = (store.items[0] && store.items[0].id) || null;
  }
  writeStore(store);
  return store.envDisabled;
}

/**
 * Définit si le spreadsheet env doit être en mode compact.
 */
function setEnvCompact(compact) {
  const store = readStore();
  store.envCompact = !!compact;
  writeStore(store);
  return store.envCompact;
}

/**
 * Renvoie l'entrée active complète (id, label, etc.) ou null.
 */
function getActiveSpreadsheet() {
  const config = buildConfig();
  const active = config.items.find(item => item.id === config.activeId);
  return active || null;
}

module.exports = {
  getSpreadsheetConfig,
  getActiveSpreadsheetId,
  getActiveSpreadsheet,
  addSpreadsheet,
  updateSpreadsheet,
  deleteSpreadsheet,
  setActiveSpreadsheet,
  setEnvDisabled,
  setEnvCompact,
};
