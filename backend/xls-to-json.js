
// Ce script Node.js utilise Express et ExcelJS.
// Mode d'emploi rapide :
// 1) Installer les dépendances : `cd backend && npm install` (Express, ExcelJS, etc.).
// 2) Déposer vos fichiers .xlsx dans `backend/archives` (les 4 premières feuilles sont lues).
// 3) Lancer le serveur local : `node backend/xls-to-json.js` (port 3000 par défaut).
// 4) Consommer les données : GET http://localhost:3000/donnees retourne le JSON formaté comme gites-data.json (sans les titres ni en-têtes internes).

const express = require('express');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const dossierXLSX = path.join(__dirname, 'archives');

// Fonction utilitaire pour formater une date ExcelJS en "DD/MM/YYYY"
function formaterDate(val) {
  if (val instanceof Date) {
    return val.toLocaleDateString('fr-FR');
  }
  return val;
}

function extraireValeur(cell) {
  if (cell && typeof cell === 'object') {
    if ('result' in cell) return cell.result;
    if ('sharedFormula' in cell) return 0; // remplace les formules partagées sans résultat par 0
  }
  return cell;
}

function estDate(val) {
  if (val instanceof Date) return true;
  if (typeof val !== 'string') return false;
  const v = val.trim();
  return /^\d{2}\/\d{2}\/\d{4}$/.test(v);
}

function normaliserTexte(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function estEnteteDeTableau(ligne) {
  const motsCles = ['nom', 'debut', 'début', 'fin', 'mois', 'nuit', 'nuits', 'adult', 'prix', 'revenu', 'paiement', 'mode', 'nb', 'nombre'];
  const cellulesTexte = ligne.filter(v => typeof v === 'string').map(normaliserTexte);
  if (cellulesTexte.length < 2) return false;

  const nbMotsCles = cellulesTexte.filter(cell => motsCles.some(m => cell.includes(m))).length;
  const contientDateOuNombre = ligne.some(val => {
    if (typeof val === 'number') return true;
    if (typeof val === 'string') {
      const v = val.trim();
      return /^\d{2}\/\d{2}\/\d{4}$/.test(v) || /^[+-]?\d+([.,]\d+)?$/.test(v);
    }
    return false;
  });

  return nbMotsCles >= 3 && !contientDateOuNombre;
}

function nettoyerLigne(valeurs) {
  const nettoyees = valeurs.map(cell => {
    let valeur = extraireValeur(cell);
    valeur = formaterDate(valeur);
    if (typeof valeur === 'string') {
      valeur = valeur.trim();
      if (valeur === '') return null;
    }
    return valeur;
  });

  // Si la colonne I indique HomeExchange, forcer G et H à 0
  const colI = nettoyees[8];
  if (typeof colI === 'string' && colI.trim().toLowerCase() === 'homeexchange') {
    nettoyees[6] = 0;
    nettoyees[7] = 0;
  }

  const nonVides = nettoyees.filter(v => v !== null && v !== undefined && v !== '');
  if (nonVides.length === 0) return null; // ligne vide
  if (estEnteteDeTableau(nettoyees)) return null; // en-tête interne à ignorer
  const hasDebut = estDate(nettoyees[1]);
  const hasFin = estDate(nettoyees[2]);
  if (!hasDebut && !hasFin) return null; // ignorer les lignes sans dates de début et de fin
  return nettoyees;
}

// Lecture d'une feuille sans les en-têtes, avec évaluation des formules
async function lireFeuille(feuille) {
  const donnees = [];

  feuille.eachRow((row) => {
    if (row.actualCellCount === 0) return;

    const valeurs = row.values.slice(1, 10);
    const ligneNettoyee = nettoyerLigne(valeurs);
    if (ligneNettoyee) donnees.push(ligneNettoyee);
  });

  return donnees;
}

// Chargement et compilation des données des 4 premières feuilles
async function chargerDonnees() {
  const fichiers = fs.readdirSync(dossierXLSX).filter(f => f.endsWith('.xlsx'));
  const gites = {};

  for (const fichier of fichiers) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(dossierXLSX, fichier));

    for (let i = 0; i < 4 && i < workbook.worksheets.length; i++) {
      const feuille = workbook.worksheets[i];
      const nomFeuille = feuille.name.trim();

      if (!gites[nomFeuille]) gites[nomFeuille] = [];

      const donnees = await lireFeuille(feuille);
      gites[nomFeuille].push(...donnees);
    }
  }

  return gites;
}

app.get('/donnees', async (req, res) => {
  try {
    const data = await chargerDonnees();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur lors de la lecture des fichiers Excel' });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur en écoute sur http://localhost:${PORT}`);
});
