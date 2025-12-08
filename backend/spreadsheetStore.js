const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const storePath = path.join(dataDir, 'spreadsheets.json');

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

function writeStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

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

function getActiveSpreadsheetId() {
  const { items, activeId } = buildConfig();
  if (!activeId) return null;
  const match = items.find(item => item.id === activeId);
  return match ? match.spreadsheetId : null;
}

function ensureUniqueSpreadsheetId(targetId, excludedId) {
  const { items } = buildConfig();
  if (items.some(item => item.spreadsheetId === targetId && item.id !== excludedId)) {
    throw new Error('Ce spreadsheetId est déjà enregistré.');
  }
}

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

function setEnvDisabled(disabled) {
  const store = readStore();
  store.envDisabled = !!disabled;
  if (store.envDisabled && store.activeId === 'env') {
    store.activeId = (store.items[0] && store.items[0].id) || null;
  }
  writeStore(store);
  return store.envDisabled;
}

function setEnvCompact(compact) {
  const store = readStore();
  store.envCompact = !!compact;
  writeStore(store);
  return store.envCompact;
}

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
