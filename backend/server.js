require('dotenv').config(); // Charge les variables d'environnement du fichier .env

const express = require('express');
const { google } = require('googleapis');
const cors = require('cors'); // Pour permettre les requêtes depuis votre front-end React
const path = require('path');
const fs = require('fs');
const {
  getSpreadsheetConfig,
  getActiveSpreadsheet,
  addSpreadsheet,
  updateSpreadsheet,
  deleteSpreadsheet,
  setActiveSpreadsheet,
  setEnvDisabled,
  setEnvCompact,
} = require('./spreadsheetStore');

const app = express();

const port = process.env.PORT || 5001; // Le port sur lequel votre serveur Node.js va écouter
const hostname = process.env.IP || '127.0.0.1'; // Valeur par défaut si non défini

app.use(express.json()); // Pour parser les requêtes JSON si besoin

if (process.env.NODE_ENV !== 'production') {
  app.use(cors()); // Autorise tout en dev
} else if (process.env.ALLOWED_ORIGIN) {
  // En prod, si une origine spécifique est fournie, on la restreint
  app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
}

// *** Servir le build React ***
// Dans le monorepo unifié, le front est dans "frontend/build"
const buildPath = path.join(__dirname, '..', 'frontend', 'build');
// Assurez-vous que le dossier de build existe et contient les fichiers statiques
app.use(express.static(buildPath));


// --- Configuration de l'API Google Sheets ---
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, // Chemin vers votre fichier JSON de credentials
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'], // Scope pour la lecture seule
});

function requireActiveSpreadsheet() {
  const active = getActiveSpreadsheet();
  if (!active || active.disabled) {
    const err = new Error('Aucun spreadsheet actif. Rendez-vous dans Paramètres pour en sélectionner un.');
    err.status = 400;
    throw err;
  }
  return active;
}

function normalizeRow(row, isCompact) {
  if (!Array.isArray(row)) return row;
  const compactLike = isCompact || row.length <= 8;
  if (compactLike) {
    const cleaned = row.slice(0, 8);
    const [nom, debut, fin, nuits, adultes, prixNuit, revenus, paiement] = cleaned;
    const mois = (typeof debut === 'string' && debut.match(/^\d{2}\/\d{2}\/\d{4}$/))
      ? Number(debut.split('/')[1])
      : null;
    return [nom, debut, fin, mois, nuits, adultes, prixNuit, revenus, paiement];
  }
  return row.slice(0, 9);
}

// Fonction pour récupérer les données d'une feuille spécifique
async function getSheetData(sheetName, activeSpreadsheet) {
  const spreadsheetId = activeSpreadsheet?.spreadsheetId;
  const isCompact = Boolean(activeSpreadsheet?.compact);
  if (!spreadsheetId) {
    throw new Error('Aucun spreadsheet actif.');
  }
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:${isCompact ? 'H' : 'I'}`, // 8 ou 9 colonnes
    });

    return (response.data.values || []).map(row => normalizeRow(row, isCompact));
  } catch (error) {
    console.error(`Erreur lors de la récupération des données de la feuille ${sheetName}:`, error);
    throw new Error(`Impossible de récupérer les données de la feuille ${sheetName}`);
  }
}

async function validateSpreadsheetAccess(spreadsheetId) {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const title = metadata?.data?.properties?.title || '';
    const firstSheetTitle = metadata?.data?.sheets?.[0]?.properties?.title;
    let readable = false;

    if (firstSheetTitle) {
      try {
        await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${firstSheetTitle}!A1:A1`,
        });
        readable = true;
      } catch (error) {
        readable = false;
      }
    }

    return {
      ok: readable,
      connectable: true,
      title,
      readable,
      firstSheetTitle,
      message: readable
        ? 'Connexion et lecture réussies.'
        : 'Connexion réussie mais impossible de lire les données.',
    };
  } catch (error) {
    console.error('Validation spreadsheet échouée :', error);
    return {
      ok: false,
      connectable: false,
      readable: false,
      message: error?.message || 'Impossible de valider ce spreadsheet.',
      status: error?.code || error?.response?.status,
    };
  }
}
function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[\s ]/g, '').replace(',', '.');
    const match = normalized.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }
  return null;
}

function parseFixedExpenseRow(row) {
  if (!Array.isArray(row)) return null;
  const [dayRaw, nameRaw, amountRaw] = row;
  const day = parseInt(dayRaw, 10);
  if (!day || day < 1 || day > 31) return null;
  const name = (nameRaw || '').toString().trim();
  const amount = parseNumber(amountRaw);
  if (!name && (amount === null || Number.isNaN(amount))) {
    return null;
  }
  return {
    day,
    name,
    amount: amount !== null && !Number.isNaN(amount) ? amount : 0,
  };
}
// Fonction utilitaire pour formater une date ExcelJS en "DD/MM/YYYY"
function formaterDate(val) {
  if (val instanceof Date) {
    return val.toLocaleDateString('fr-FR');
  }
  return val;
}

// Lecture d'une feuille sans les en-têtes, avec évaluation des formules
async function lireFeuille(feuille) {
  const donnees = [];

  feuille.eachRow((row, rowNumber) => {
    if (row.actualCellCount === 0) return;

    const valeurs = row.values.slice(1).map(cell => {
      let valeur = (cell && typeof cell === 'object' && 'result' in cell) ? cell.result : cell;
      return formaterDate(valeur);
    });

    donnees.push(valeurs);
  });

  return donnees.slice(1); // Ignorer les en-têtes
}

// Fonction de nettoyage et fusion des données
function nettoyerEtFusionner(google, archives) {
  const colonnesNumeriques = [3, 4, 5, 6, 7]; // index Mois, Nb Nuits, Nb Adultes, Prix/Nuit, Revenus

  const nettoyer = (ligne) => {
    if (!Array.isArray(ligne)) return null;
    const cleaned = ligne.slice(0, 9).map((val, i) => {
      if (typeof val === 'string') val = val.trim();
      if (colonnesNumeriques.includes(i)) {
        if (typeof val === 'string') {
          // Gestion des espaces insécables, séparateurs français
          const cleanedVal = val.replace(/[\s ]/g, '').replace(',', '.');
          const match = cleanedVal.match(/-?\d+(\.\d+)?/);
          return match ? parseFloat(match[0]) : (typeof val === 'number' ? val : null);
        }
        return typeof val === 'number' ? val : null;
      }
      return val === '' ? null : val;
    });
    return cleaned.every(v => v === null || v === '') ? null : cleaned;
  };

  const uniqueKey = (ligne) => JSON.stringify(ligne);

  const nettoyeesGoogle = google.map(nettoyer).filter(Boolean);
  const nettoyeesArchives = archives.map(nettoyer).filter(Boolean);

  const titres = nettoyeesGoogle[0];
  const contenu = [...nettoyeesGoogle.slice(1), ...nettoyeesArchives];

  const vus = new Set();
  const fusion = [titres];

  for (const ligne of contenu) {
    const cle = uniqueKey(ligne);
    if (!vus.has(cle)) {
      vus.add(cle);
for (const partie of decouperSiChevaucheDeuxMois(ligne)) {
  fusion.push(partie);
}

    }
  }

  // Tri sur la première date rencontrée dans la ligne
  fusion.sort((a, b) => {
    const getDate = (ligne) => {
      for (const val of ligne) {
        if (typeof val === 'string' && val.match(/\d{2}\/\d{2}\/\d{4}/)) {
          const [d, m, y] = val.split('/');
          return new Date(`${y}-${m}-${d}`);
        }
      }
      return new Date('2100-01-01');
    };
    return getDate(a) - getDate(b);
  });

// Fonction utilitaire pour parser une date "DD/MM/YYYY"
// Fonction utilitaire pour parser une date "DD/MM/YYYY"
const parseDate = (str) => {
  if (!str || typeof str !== 'string' || !str.includes('/')) return null;
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return new Date(`${y}-${m}-${d}`);
};

// Fonction utilitaire pour formater une date JS en "DD/MM/YYYY"
const formatDate = (date) =>
  date.toLocaleDateString('fr-FR').split('/').map(s => s.padStart(2, '0')).join('/');

// Fonction pour calculer les nuits entre deux dates (non inclusif de la fin)
const calculerNuits = (debut, fin) => {
  const msParNuit = 1000 * 60 * 60 * 24;
  return Math.round((fin - debut) / msParNuit);
};

// Traitement pour scinder les lignes qui chevauchent deux mois
const lignesFractionnees = [fusion[0]]; // garder les titres

for (let i = 1; i < fusion.length; i++) {
  const ligne = fusion[i];
  const nom = ligne[0];
  const debutStr = ligne[1];
  const finStr = ligne[2];
  const nbNuits = ligne[3];

  const debut = parseDate(debutStr);
  const fin = parseDate(finStr);

  // Si l'une des dates est invalide, on garde la ligne telle quelle
  if (!debut || !fin) {
    lignesFractionnees.push(ligne);
    continue;
  }

  // Vérifie si la réservation chevauche deux mois
  if (
    debut.getMonth() !== fin.getMonth() ||
    debut.getFullYear() !== fin.getFullYear()
  ) {
    const finPremierMois = new Date(debut.getFullYear(), debut.getMonth() + 1, 0);
    const debutDeuxiemeMois = new Date(fin.getFullYear(), fin.getMonth(), 1);

    const nuits1 = calculerNuits(debut, new Date(finPremierMois.getFullYear(), finPremierMois.getMonth(), finPremierMois.getDate() + 1));
    const nuits2 = calculerNuits(debutDeuxiemeMois, fin);

    if (nuits1 > 0) {
      const ligne1 = [...ligne];
      ligne1[1] = formatDate(debut);
      ligne1[2] = formatDate(finPremierMois);
      ligne1[3] = nuits1;
      lignesFractionnees.push(ligne1);
    }

    if (nuits2 > 0) {
      const ligne2 = [...ligne];
      ligne2[1] = formatDate(debutDeuxiemeMois);
      ligne2[2] = formatDate(fin);
      ligne2[3] = nuits2;
      lignesFractionnees.push(ligne2);
    }
  } else {
    lignesFractionnees.push(ligne);
  }
}

return lignesFractionnees;


}

app.get('/api/spreadsheets', (req, res) => {
  const config = getSpreadsheetConfig();
  res.json(config);
});

app.post('/api/spreadsheets/validate', async (req, res) => {
  const { spreadsheetId } = req.body || {};
  if (!spreadsheetId) {
    return res.status(400).json({ message: 'spreadsheetId requis.' });
  }
  const validation = await validateSpreadsheetAccess(spreadsheetId);
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message, validation });
  }
  res.json({ validation });
});

app.post('/api/spreadsheets', async (req, res) => {
  const { spreadsheetId, label, compact } = req.body || {};
  if (!spreadsheetId) {
    return res.status(400).json({ message: 'spreadsheetId requis.' });
  }
  try {
    const validation = await validateSpreadsheetAccess(spreadsheetId);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message, validation });
    }
    const item = addSpreadsheet({ spreadsheetId, label, compact: Boolean(compact) });
    const config = getSpreadsheetConfig();
    res.status(201).json({ item, validation, activeId: config.activeId });
  } catch (error) {
    console.error("Erreur lors de l'ajout de spreadsheet :", error);
    res.status(400).json({ message: error.message || "Impossible d'ajouter ce spreadsheet." });
  }
});

app.put('/api/spreadsheets/:id', async (req, res) => {
  const { id } = req.params;
  const { spreadsheetId, label, compact } = req.body || {};
  if (!spreadsheetId && label === undefined && compact === undefined) {
    return res.status(400).json({ message: 'Aucune modification fournie.' });
  }
  try {
    let validation = null;
    if (spreadsheetId) {
      validation = await validateSpreadsheetAccess(spreadsheetId);
      if (!validation.ok) {
        return res.status(400).json({ message: validation.message, validation });
      }
    }
    const item = updateSpreadsheet(id, { spreadsheetId, label, compact });
    res.json({ item, validation });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de spreadsheet :', error);
    res.status(400).json({ message: error.message || 'Impossible de mettre à jour ce spreadsheet.' });
  }
});

app.delete('/api/spreadsheets/:id', (req, res) => {
  const { id } = req.params;
  try {
    const activeId = deleteSpreadsheet(id);
    res.json({ activeId });
  } catch (error) {
    console.error('Erreur lors de la suppression de spreadsheet :', error);
    res.status(400).json({ message: error.message || 'Impossible de supprimer ce spreadsheet.' });
  }
});

app.post('/api/spreadsheets/:id/activate', (req, res) => {
  const { id } = req.params;
  try {
    const config = getSpreadsheetConfig();
    const target = config.items.find(item => item.id === id);
    if (!target) {
      return res.status(404).json({ message: 'Spreadsheet introuvable.' });
    }
    if (target.disabled) {
      return res.status(400).json({ message: "Ce spreadsheet est désactivé." });
    }
    setActiveSpreadsheet(id);
    res.json({ activeId: id });
  } catch (error) {
    console.error("Erreur lors de l'activation de spreadsheet :", error);
    res.status(400).json({ message: error.message || "Impossible d'activer ce spreadsheet." });
  }
});

app.post('/api/spreadsheets/env/disable', (req, res) => {
  try {
    const { disabled } = req.body || {};
    setEnvDisabled(Boolean(disabled));
    const config = getSpreadsheetConfig();
    res.json(config);
  } catch (error) {
    console.error("Erreur lors de la désactivation de l'env :", error);
    res.status(400).json({ message: error.message || "Impossible de désactiver ce spreadsheet." });
  }
});

app.post('/api/spreadsheets/env/compact', (req, res) => {
  try {
    const { compact } = req.body || {};
    setEnvCompact(Boolean(compact));
    const config = getSpreadsheetConfig();
    res.json(config);
  } catch (error) {
    console.error("Erreur lors du changement de mode compact env :", error);
    res.status(400).json({ message: error.message || "Impossible de modifier ce spreadsheet." });
  }
});


// Route enrichie pour Google + Archives
app.get( '/api/gites-data', async (req, res) => { //
  try {
    const activeSpreadsheet = requireActiveSpreadsheet();
    const gites = ['Phonsine', 'Gree', 'Edmond', 'Liberté'];
    const allGiteData = {};

    const archivesPath = path.join(__dirname, 'archives', 'archives.json');
    const archives = JSON.parse(fs.readFileSync(archivesPath, 'utf-8'));

    for (const gite of gites) {
      const googleData = await getSheetData(gite, activeSpreadsheet);
      const archiveData = (archives[gite] || []).map(ligne => ligne.slice(0, 9));
      const fusion = nettoyerEtFusionner(googleData, archiveData);
      allGiteData[gite] = fusion;
    }
    // Ajout des données d'archives
    res.json(allGiteData);
  } catch (error) {
    console.error('Erreur lors de la fusion des données :', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

app.get('/api/fixed-expenses', async (req, res) => {
  try {
    const activeSpreadsheet = requireActiveSpreadsheet();
    const rows = await getSheetData('Frais', activeSpreadsheet);
    if (!rows || rows.length === 0) {
      return res.json([]);
    }
    const expenses = rows
      .slice(1) // Ignore l'en-tête
      .map(parseFixedExpenseRow)
      .filter(Boolean);
    res.json(expenses);
  } catch (error) {
    console.error('Erreur lors de la récupération des frais fixes :', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

// *** Pour toutes les autres routes (sauf API), servir index.html du build React ***
app.get('/*splat', (req, res) => {
  // Important : placer cette route APRES toutes les routes API !
  res.sendFile(path.join(buildPath, 'index.html')); // Envoie le fichier index.html du build React
});




// Démarrage du serveur
app.listen(port, () => {
     console.log(`Serveur backend lancé sur http://${hostname}:${port}`);
});


function decouperSiChevaucheDeuxMois(ligne) {
  const prixParNuitIdx = 6;
  const revenusIdx = 7;

  const [nom, debutStr, finStr, mois, nuits, ...reste] = ligne;

  if (
    typeof debutStr !== 'string' ||
    typeof finStr !== 'string' ||
    !debutStr.match(/^\d{2}\/\d{2}\/\d{4}$/) ||
    !finStr.match(/^\d{2}\/\d{2}\/\d{4}$/)
  ) {
    return [ligne];
  }

  const [d1, m1, y1] = debutStr.split('/').map(Number);
  const [d2, m2, y2] = finStr.split('/').map(Number);
  const debut = new Date(y1, m1 - 1, d1);
  const fin = new Date(y2, m2 - 1, d2);

  // Cas particulier : date de fin est le 1er du mois suivant → on garde tout sur le mois de début
  if (
    debut.getMonth() === fin.getMonth() && debut.getFullYear() === fin.getFullYear()
    ||
    (fin.getDate() === 1 && (
      (fin.getMonth() > debut.getMonth() && fin.getFullYear() === debut.getFullYear()) ||
      (fin.getMonth() === 0 && debut.getMonth() === 11 && fin.getFullYear() === debut.getFullYear() + 1)
    ))
  ) {
    return [ligne];
  }

  // Trouver le dernier jour de ce mois
  const finMoisDate = new Date(debut.getFullYear(), debut.getMonth() + 1, 0);

  // Le jour après le dernier jour du mois courant (c'est le 1er du mois suivant)
  const debutMoisSuivant = new Date(debut.getFullYear(), debut.getMonth() + 1, 1);

  // Calcul du nombre de nuits dans chaque segment :
  // Le segment 1 : du début au 1er du mois suivant (non inclusif)
  const nuits1 = Math.round((debutMoisSuivant - debut) / (1000 * 60 * 60 * 24));
  // Le segment 2 : du 1er du mois suivant à la date de fin (non inclusive)
  const nuits2 = Math.round((fin - debutMoisSuivant) / (1000 * 60 * 60 * 24));
  const prixParNuit = Number(ligne[prixParNuitIdx]);

  const results = [];

  if (nuits1 > 0) {
    const ligne1 = [...ligne];
    ligne1[1] = debutStr;
    ligne1[2] = `${String(finMoisDate.getDate()).padStart(2, '0')}/${String(finMoisDate.getMonth() + 1).padStart(2, '0')}/${finMoisDate.getFullYear()}`;
    ligne1[3] = debut.getMonth() + 1;
    ligne1[4] = nuits1;
    if (!isNaN(prixParNuit)) {
      ligne1[revenusIdx] = +(prixParNuit * nuits1).toFixed(2);
    }
    results.push(ligne1);
  }

  if (nuits2 > 0) {
    const ligne2 = [...ligne];
    ligne2[1] = `01/${String(debutMoisSuivant.getMonth() + 1).padStart(2, '0')}/${debutMoisSuivant.getFullYear()}`;
    ligne2[2] = finStr;
    ligne2[3] = fin.getMonth() + 1;
    ligne2[4] = nuits2;
    if (!isNaN(prixParNuit)) {
      ligne2[revenusIdx] = +(prixParNuit * nuits2).toFixed(2);
    }
    results.push(ligne2);
  }

  return results.length ? results : [ligne];
}
