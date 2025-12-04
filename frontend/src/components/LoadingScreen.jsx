import React from "react";
import { Box, Typography, Button } from "@mui/material";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

const STATUS_LABELS = {
  pending: "En attente",
  in_progress: "En cours",
  done: "Terminé",
  error: "Erreur",
};

const getProgressValue = (steps = []) => {
  if (!steps.length) return 0;
  const completed = steps.filter((step) => step.status === "done").length;
  const active = steps.find((step) => step.status === "in_progress");
  const inProgressWeight = active ? 0.4 : 0;
  return Math.min(
    100,
    Math.round(((completed + inProgressWeight) / steps.length) * 100)
  );
};

const LoadingScreen = ({ steps = [], error = "", onRetry }) => {
  const progressValue = getProgressValue(steps);
  const activeStep = steps.find((step) => step.status === "in_progress");
  const meterClass = [
    "loading-meter-fill",
    error ? "error" : "",
    progressValue >= 100 ? "complete" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const subtitle = error
    ? "Un blocage empêche le chargement des données."
    : activeStep
      ? `On avance : ${activeStep.label}`
      : "Préparation terminée.";

  return (
    <Box className="loading-shell">
      <div className="loading-card">
        <div className="loading-hero">
          <div className="loading-badge">
            <span className="loading-dot" />
            <Typography variant="body2" fontWeight={600}>
              Chargement en cours
            </Typography>
          </div>
          <Typography variant="h5" fontWeight={700}>
            Les Gîtes de Brocéliande
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {subtitle}
          </Typography>
        </div>

        <div className="loading-meter" aria-label="Progression du chargement">
          <div
            className={meterClass}
            style={{ width: `${progressValue}%` }}
          />
        </div>

        <div className="loading-steps">
          {steps.map((step) => (
            <div key={step.id} className={`loading-step ${step.status}`}>
              <div className="step-icon">
                {step.status === "done" && <CheckCircleIcon fontSize="small" />}
                {step.status === "error" && (
                  <ErrorOutlineIcon fontSize="small" />
                )}
                {(step.status === "pending" ||
                  step.status === "in_progress") && (
                    <AutorenewIcon
                      fontSize="small"
                      className={step.status === "in_progress" ? "spin" : ""}
                    />
                  )}
              </div>
              <div className="step-copy">
                <Typography className="step-label">{step.label}</Typography>
                <Typography className="step-status">
                  {STATUS_LABELS[step.status] || "En attente"}
                </Typography>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <Box className="loading-error">
            <Typography color="error" fontWeight={600}>
              {error}
            </Typography>
            {onRetry && (
              <Button variant="contained" color="primary" onClick={onRetry}>
                Réessayer
              </Button>
            )}
          </Box>
        )}
      </div>
    </Box>
  );
};

export default LoadingScreen;
