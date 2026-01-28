import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Container,
  Grid,
  CssBaseline,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import Header from "./components/Header";
import GiteCard from "./components/GiteCard";
import { parseGitesData, getAvailableYears, computeGlobalStats } from "./utils/dataUtils";
import "./index.css";
import DebugCA from "./components/DebugCA";
const GlobalRevenueChart = React.lazy(() => import('./components/GlobalRevenueChart'));
import ShowChartIcon from "@mui/icons-material/ShowChart";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SettingsIcon from "@mui/icons-material/Settings";
import FixedExpensesPanel from "./components/FixedExpensesPanel";
import LoadingScreen from "./components/LoadingScreen";
import SettingsPanel from "./components/SettingsPanel";

const GITE_NAMES = ["Phonsine", "Gree", "Edmond", "Liberté"];
const GITES_API_URL = import.meta.env.VITE_GITES_API || "/api/gites-data";
const EXPENSES_API_URL = import.meta.env.VITE_FIXED_EXPENSES_API || "/api/fixed-expenses";
const PASSWORD = "tellthem"; // ← Change-le si tu veux
const LOADING_STEPS = [
  { id: "fetchData", label: "Connexion aux données des gîtes" },
  { id: "parseData", label: "Analyse des réservations" },
  { id: "uiReady", label: "Préparation des tableaux de bord" },
];

const buildInitialLoadingSteps = () =>
  LOADING_STEPS.map((step, index) => ({
    ...step,
    status: index === 0 ? "in_progress" : "pending",
  }));

function App() {
  // >>>>>> Place ici la logique d'authentification <<<<<<
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (localStorage.getItem("gites-authenticated") === "true") {
      setAuthenticated(true);
    }
  }, []);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === PASSWORD) {
      setAuthenticated(true);
      localStorage.setItem("gites-authenticated", "true");
      setError("");
    } else {
      setError("Mot de passe incorrect.");
    }
  };

  // >>>>>> FIN logique d'authentification <<<<<<

  const [rawData, setRawData] = useState(null);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [loadingSteps, setLoadingSteps] = useState(buildInitialLoadingSteps);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesError, setExpensesError] = useState("");
  const [activePanel, setActivePanel] = useState("stats");
  const finishTimerRef = useRef(null);

  // Sélection année/mois
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(''); // '' = année entière (évite value=null sur <input>)

  // Sélection gîte ou année pour les graphiques globaux
  const [selectedItem, setSelectedItem] = useState("Tous");

  // Switch URSSAF
  const [showUrssaf, setShowUrssaf] = useState(false);
  // Switch Stats
  const [showStats, setShowStats] = useState(false);

  // Gestion années disponibles
  const [availableYears, setAvailableYears] = useState([]);

  const resetLoadingSteps = useCallback(() => {
    setLoadingSteps(buildInitialLoadingSteps());
  }, []);

  const updateStepStatus = useCallback((id, status) => {
    setLoadingSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, status } : step))
    );
  }, []);

  const markCurrentStepAsError = useCallback(() => {
    setLoadingSteps((prev) => {
      const activeIndex = prev.findIndex((step) => step.status === "in_progress");
      if (activeIndex === -1) return prev;
      const next = [...prev];
      next[activeIndex] = { ...next[activeIndex], status: "error" };
      return next;
    });
  }, []);

  const finishLoading = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
    }
    finishTimerRef.current = setTimeout(() => setLoading(false), 320);
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    setLoadingError("");
    resetLoadingSteps();

    fetch(GITES_API_URL)
      .then(async (res) => {
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.message) message = body.message;
          } catch (e) {
            // ignore parsing errors
          }
          throw new Error(message);
        }
        return res.json();
      })
      .then((json) => {
        setRawData(json);
        updateStepStatus("fetchData", "done");

        updateStepStatus("parseData", "in_progress");
        let parsed;
        try {
          parsed = parseGitesData(json);
        } catch (err) {
          console.error("Erreur pendant l'analyse des données :", err);
          updateStepStatus("parseData", "error");
          throw err;
        }
        setData(parsed);
        updateStepStatus("parseData", "done");

        updateStepStatus("uiReady", "in_progress");
        setAvailableYears(getAvailableYears(parsed));
        updateStepStatus("uiReady", "done");
        finishLoading();
      })
      .catch((err) => {
        console.error("Erreur lors du chargement des données :", err);
        markCurrentStepAsError();
        setLoadingError(
          err?.message || "Impossible de récupérer les données des gîtes. Vérifie la connexion et réessaie."
        );
        setLoading(false);
      });
  }, [finishLoading, markCurrentStepAsError, resetLoadingSteps, updateStepStatus]);

  const loadExpenses = useCallback(() => {
    setExpensesLoading(true);
    setExpensesError("");
    fetch(EXPENSES_API_URL)
      .then(async res => {
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.message) message = body.message;
          } catch (e) {
            // ignore parse errors
          }
          throw new Error(message);
        }
        return res.json();
      })
      .then(json => {
        setFixedExpenses(Array.isArray(json) ? json : []);
        setExpensesError("");
        setExpensesLoading(false);
      })
      .catch(err => {
        console.error("Erreur lors du chargement des frais fixes :", err);
        setFixedExpenses([]);
        setExpensesError(err?.message || "Impossible de charger les frais fixes.");
        setExpensesLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Statistiques globales (header)
  const globalStats = rawData
    ? computeGlobalStats(data, selectedYear, selectedMonth)
    : { totalReservations: 0, totalNights: 0, totalCA: 0 };

  // ---------- AFFICHAGE FORMULAIRE MOT DE PASSE SI BESOIN ----------
  if (!authenticated) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fa"
      }}>
        <form onSubmit={handlePasswordSubmit}
              style={{
                background: "#fff",
                padding: 32,
                borderRadius: 12,
                boxShadow: "0 4px 24px #ddd",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minWidth: 280
              }}>
          <h2 style={{ marginBottom: 16 }}>Accès protégé</h2>
          <input
            type="password"
            placeholder="Mot de passe…"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            style={{
              padding: 10, fontSize: 18, borderRadius: 5, border: "1px solid #ccc", marginBottom: 12, width: "100%"
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 22px",
              fontSize: 17,
              borderRadius: 5,
              border: "none",
              background: "#2D8CFF",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Entrer
          </button>
          {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}
        </form>
      </div>
    );
  }
  // ---------- FIN FORMULAIRE MOT DE PASSE ----------

  if (loading || loadingError) {
    return (
      <LoadingScreen
        steps={loadingSteps}
        error={loadingError}
        onRetry={loadingError ? loadData : undefined}
      />
    );
  }

  const isYearSelection = typeof selectedItem === "number";
  const chartData = isYearSelection
    ? data
    : selectedItem === "Tous"
      ? data
      : { [selectedItem]: data[selectedItem] || [] };
  const labelsForChart = isYearSelection ? GITE_NAMES : getAvailableYears(chartData);
  const panelOrder = ["stats", "expenses", "settings"];
  const panelIndex = Math.max(panelOrder.indexOf(activePanel), 0);

  return (
    <>
      <CssBaseline />
      <div className="app-root">
        <div
          className="panel-track"
          style={{ transform: `translateX(-${panelIndex * 100}%)` }}
        >
          <div className="panel stats-panel">
            <Container maxWidth="lg" sx={{ py: 2, pb: 12 }}>
              <Header
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                availableYears={availableYears}
                showUrssaf={showUrssaf}
                setShowUrssaf={setShowUrssaf}
                showStats={showStats}
                setShowStats={setShowStats}
                data={data}
                globalStats={globalStats}
              />

              <Grid container spacing={3} sx={{ mt: 2 }}>
                {GITE_NAMES.map(name => (
                  <Grid key={name} item xs={12} sm={6}>
                    <GiteCard
                      name={name}
                      data={data[name] || []}
                      selectedYear={selectedYear}
                      selectedMonth={selectedMonth}
                      availableYears={availableYears}
                      showUrssaf={showUrssaf}
                      showStats={showStats}
                    />
                  </Grid>
                ))}
              </Grid>
              <FormControl fullWidth sx={{ mt: 4 }}>
                <InputLabel id="gite-select-label">Gîte ou année</InputLabel>
                <Select
                  labelId="gite-select-label"
                  value={selectedItem}
                  label="Gîte ou année"
                  onChange={(e) => setSelectedItem(e.target.value)}
                >
                  <MenuItem value="Tous">Tous les gîtes</MenuItem>
                  {GITE_NAMES.map(name => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                  {availableYears.map(year => (
                    <MenuItem key={year} value={year}>{year}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <React.Suspense fallback={<div style={{ padding: 12, color: '#bdbdbd', fontSize: 12 }}>Chargement du graphique...</div>}>
                <GlobalRevenueChart data={chartData} labels={labelsForChart} selectedOption={selectedItem} />
              </React.Suspense>
            </Container>
          </div>
          <div className="panel expenses-panel">
            <FixedExpensesPanel
              expenses={fixedExpenses}
              loading={expensesLoading}
              error={expensesError}
            />
          </div>
          <div className="panel settings-panel">
            <SettingsPanel
              onSpreadsheetChange={() => {
                loadData();
                loadExpenses();
              }}
            />
          </div>
        </div>
        <Paper elevation={8} className="bottom-nav">
          <BottomNavigation
            value={activePanel}
            onChange={(_, value) => setActivePanel(value)}
            showLabels
          >
            <BottomNavigationAction
              label="Statistiques"
              value="stats"
              icon={<ShowChartIcon />}
            />
            <BottomNavigationAction
              label="Frais fixes"
              value="expenses"
              icon={<ReceiptLongIcon />}
            />
            <BottomNavigationAction
              label="Paramètres"
              value="settings"
              icon={<SettingsIcon />}
            />
          </BottomNavigation>
        </Paper>
      </div>
      {/*  <DebugCA data={data["Edmond"] || []} /> Composant de debug pour les données d'Edmond */}
    </>
  );
}

export default App;
