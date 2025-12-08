import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Switch,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import CloudOffIcon from "@mui/icons-material/CloudOff";

const INITIAL_FORM = { spreadsheetId: "", label: "" };

function SettingsPanel({ onSpreadsheetChange }) {
  const [config, setConfig] = useState({ items: [], activeId: null, envSpreadsheetId: null, envDisabled: false, envCompact: false });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);
  const [validationResult, setValidationResult] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(INITIAL_FORM);

  const items = useMemo(() => config.items || [], [config]);
  const activeItem = useMemo(
    () => items.find(item => item.id === config.activeId),
    [items, config.activeId]
  );

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/spreadsheets");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Impossible de récupérer les paramètres.");
      }
      setConfig(data);
      setError("");
    } catch (err) {
      console.error("Erreur chargement paramètres :", err);
      setError(err?.message || "Impossible de récupérer les paramètres.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const validateSpreadsheet = async (spreadsheetId) => {
    const res = await fetch("/api/spreadsheets/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    const validation = data?.validation || data || {};
    return {
      ...validation,
      ok: validation.ok ?? res.ok,
      message: validation.message || data?.message || "Impossible de valider ce spreadsheetId.",
    };
  };

  const handleAddSpreadsheet = async (event) => {
    event.preventDefault();
    if (!form.spreadsheetId.trim()) {
      setError("Indique un spreadsheetId avant d'ajouter.");
      return;
    }
    setSaving(true);
    setError("");
    setValidationResult(null);
    try {
      const validation = await validateSpreadsheet(form.spreadsheetId.trim());
      setValidationResult(validation);
      if (!validation.ok) {
        setError(validation.message || "Le document n'est pas lisible.");
        return;
      }

      const res = await fetch("/api/spreadsheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: form.spreadsheetId.trim(),
          label: form.label.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Impossible d'ajouter ce spreadsheetId.");
      }
      setForm(INITIAL_FORM);
      await loadConfig();
      onSpreadsheetChange && onSpreadsheetChange();
    } catch (err) {
      setError(err?.message || "Impossible d'ajouter ce spreadsheetId.");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id) => {
    setActionId(id);
    setError("");
    try {
      const res = await fetch(`/api/spreadsheets/${id}/activate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Activation impossible.");
      }
      await loadConfig();
      onSpreadsheetChange && onSpreadsheetChange();
    } catch (err) {
      setError(err?.message || "Activation impossible.");
    } finally {
      setActionId(null);
    }
  };

  const handleToggleEnv = async (disabled) => {
    setActionId("env-toggle");
    setError("");
    try {
      const res = await fetch("/api/spreadsheets/env/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Mise à jour impossible.");
      }
      setConfig(data);
      onSpreadsheetChange && onSpreadsheetChange();
    } catch (err) {
      setError(err?.message || "Mise à jour impossible.");
    } finally {
      setActionId(null);
    }
  };

  const handleToggleEnvCompact = async (compact) => {
    setActionId("env-compact");
    setError("");
    try {
      const res = await fetch("/api/spreadsheets/env/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compact }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Mise à jour impossible.");
      }
      setConfig(data);
      onSpreadsheetChange && onSpreadsheetChange();
    } catch (err) {
      setError(err?.message || "Mise à jour impossible.");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer ce spreadsheetId ?")) return;
    setActionId(id);
    setError("");
    try {
      const res = await fetch(`/api/spreadsheets/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Suppression impossible.");
      }
      await loadConfig();
      onSpreadsheetChange && onSpreadsheetChange();
    } catch (err) {
      setError(err?.message || "Suppression impossible.");
    } finally {
      setActionId(null);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditDraft({ spreadsheetId: item.spreadsheetId, label: item.label || "" });
    setValidationResult(null);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(INITIAL_FORM);
  };

  const handleToggleCompact = async (item, compact) => {
    if (item.source === "env") {
      await handleToggleEnvCompact(compact);
      return;
    }
    setActionId(`compact-${item.id}`);
    setError("");
    try {
      const res = await fetch(`/api/spreadsheets/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compact }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Mise à jour impossible.");
      }
      await loadConfig();
      onSpreadsheetChange && onSpreadsheetChange();
    } catch (err) {
      setError(err?.message || "Mise à jour impossible.");
    } finally {
      setActionId(null);
    }
  };

  const handleSaveEdit = async (id) => {
    if (!editDraft.spreadsheetId.trim()) {
      setError("Indique un spreadsheetId avant de sauvegarder.");
      return;
    }
    setActionId(id);
    setError("");
    try {
      const validation = await validateSpreadsheet(editDraft.spreadsheetId.trim());
      setValidationResult(validation);
      if (!validation.ok) {
        setError(validation.message || "Le document n'est pas lisible.");
        return;
      }
      const res = await fetch(`/api/spreadsheets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: editDraft.spreadsheetId.trim(),
          label: editDraft.label.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Mise à jour impossible.");
      }
      setEditingId(null);
      setEditDraft(INITIAL_FORM);
      await loadConfig();
      onSpreadsheetChange && onSpreadsheetChange();
    } catch (err) {
      setError(err?.message || "Mise à jour impossible.");
    } finally {
      setActionId(null);
    }
  };

  const renderStatusChip = (item) => {
    const isActive = item.id === config.activeId;
    const isEnv = item.source === "env";
    const envDisabled = config.envDisabled && isEnv;
    if (envDisabled) {
      return (
        <Chip
          size="small"
          color="warning"
          label="Désactivé"
          icon={<CloudOffIcon fontSize="small" />}
        />
      );
    }
    if (isActive) {
      return (
        <Chip
          size="small"
          color="success"
          label="Actif"
          icon={<CheckCircleIcon fontSize="small" />}
        />
      );
    }
    return (
      <Button
        size="small"
        variant="outlined"
        onClick={() => handleActivate(item.id)}
        disabled={Boolean(actionId)}
      >
        {actionId === item.id ? <CircularProgress size={18} /> : "Activer"}
      </Button>
    );
  };

  const renderValidationStatus = () => {
    if (!validationResult) return null;
    const ok = validationResult.ok;
    return (
      <Alert
        severity={ok ? "success" : "warning"}
        icon={ok ? <CloudDoneIcon fontSize="inherit" /> : <CloudOffIcon fontSize="inherit" />}
        sx={{ mt: 2 }}
      >
        <strong>{validationResult.title || "Spreadsheet"}</strong> —{" "}
        {validationResult.message || (ok ? "Accès confirmé." : "Impossible de lire ce document.")}
      </Alert>
    );
  };

  return (
    <Box className="settings-panel">
      <Paper elevation={2} className="settings-card">
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Paramètres
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Gestion des spreadsheetId (ajout, édition, suppression, activation).
            </Typography>
          </Box>
          {activeItem && (
            <Chip
              color="primary"
              label={`Actuel : ${activeItem.label || truncateId(activeItem.spreadsheetId)}`}
            />
          )}
        </Stack>

        <Box
          component="form"
          onSubmit={handleAddSpreadsheet}
          sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            Gestion des spreadsheetId
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="spreadsheetId"
              value={form.spreadsheetId}
              onChange={(e) => setForm({ ...form, spreadsheetId: e.target.value })}
              fullWidth
              required
              helperText="Coller la partie entre /d/ et /edit dans l'URL Google Sheets."
            />
            <TextField
              label="Nom (optionnel)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={saving ? <CircularProgress size={18} /> : <AddIcon />}
              disabled={saving}
            >
              Tester & ajouter
            </Button>
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {renderValidationStatus()}

        <Divider sx={{ my: 3 }} />

        {config.envDisabled && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Le spreadsheetId provenant du fichier .env est désactivé. Active un autre document pour continuer.
          </Alert>
        )}

        {loading ? (
          <Box className="panel-loading" sx={{ py: 4 }}>
            <CircularProgress />
            <Typography variant="body2" mt={2}>Chargement des paramètres…</Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {items.map(item => {
              const isEnv = item.source === "env";
              const isEditing = editingId === item.id;
              const envDisabled = config.envDisabled && isEnv;
              return (
                <Paper key={item.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start" justifyContent="space-between">
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" fontWeight={700}>
                          {isEditing ? (
                            <TextField
                              size="small"
                              label="Nom"
                              value={editDraft.label}
                              onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                            />
                          ) : (
                            item.label || "Sans titre"
                          )}
                        </Typography>
                        <Chip size="small" label={isEnv ? "Environnement" : "Personnalisé"} />
                        {renderStatusChip(item)}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {isEditing ? (
                          <TextField
                            size="small"
                            label="spreadsheetId"
                            value={editDraft.spreadsheetId}
                            onChange={(e) => setEditDraft({ ...editDraft, spreadsheetId: e.target.value })}
                            fullWidth
                          />
                        ) : (
                          truncateId(item.spreadsheetId)
                        )}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                        <Switch
                          size="small"
                          checked={Boolean(item.compact)}
                          onChange={(e) => handleToggleCompact(item, e.target.checked)}
                          disabled={Boolean(actionId)}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Mode compact (8 colonnes)
                        </Typography>
                      </Stack>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {isEnv ? (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={
                            actionId === "env-toggle" ? (
                              <CircularProgress size={16} />
                            ) : envDisabled ? (
                              <CloudDoneIcon />
                            ) : (
                              <CloudOffIcon />
                            )
                          }
                          onClick={() => handleToggleEnv(!envDisabled)}
                          disabled={Boolean(actionId)}
                        >
                          {envDisabled ? "Réactiver" : "Désactiver"}
                        </Button>
                      ) : isEditing ? (
                        <>
                          <IconButton color="primary" onClick={() => handleSaveEdit(item.id)} disabled={Boolean(actionId)}>
                            {actionId === item.id ? <CircularProgress size={18} /> : <SaveIcon />}
                          </IconButton>
                          <IconButton onClick={cancelEdit}>
                            <CloseIcon />
                          </IconButton>
                        </>
                      ) : (
                        !isEnv && (
                          <>
                            <Tooltip title="Modifier">
                              <IconButton onClick={() => startEdit(item)}>
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Supprimer">
                              <IconButton onClick={() => handleDelete(item.id)} disabled={Boolean(actionId)}>
                                {actionId === item.id ? <CircularProgress size={18} /> : <DeleteOutlineIcon />}
                              </IconButton>
                            </Tooltip>
                          </>
                        )
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
            {items.length === 0 && (
              <Alert severity="info">Aucun spreadsheet configuré. Utilise le formulaire ci-dessus pour en ajouter un.</Alert>
            )}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

function truncateId(id = "") {
  if (id.length <= 28) return id;
  return `${id.slice(0, 14)}...${id.slice(-6)}`;
}

export default SettingsPanel;
