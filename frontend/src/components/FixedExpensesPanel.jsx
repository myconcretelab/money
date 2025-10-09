import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Typography,
  Divider,
  Chip,
} from "@mui/material";

const DAYS_IN_MONTH = 31;

function getIntensityColor(amount, maxAmount) {
  if (!maxAmount) return "linear-gradient(135deg, #6AD68F, #43B77D)";
  const ratio = Math.min(Math.max(amount / maxAmount, 0), 1);
  const hue = 120 - ratio * 120; // 120 (vert) -> 0 (rouge)
  const primary = `hsl(${hue}, 75%, 52%)`;
  const secondary = `hsl(${hue}, 70%, 45%)`;
  return `linear-gradient(135deg, ${primary}, ${secondary})`;
}

function computeDayStatus(day, todayDay) {
  if (day < todayDay) return "past";
  if (day === todayDay) return "today";
  if (day === todayDay + 1) return "tomorrow";
  if (day === todayDay + 2) return "dayAfterTomorrow";
  return "future";
}

const FixedExpensesPanel = ({ expenses, loading, error }) => {
  const containerRef = useRef(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const today = useMemo(() => new Date(), []);
  const todayDay = today.getDate();

  const expensesByDay = useMemo(() => {
    const bucket = {};
    (expenses || []).forEach(item => {
      const day = Number(item?.day);
      if (!day || day < 1 || day > 31) return;
      if (!bucket[day]) bucket[day] = [];
      bucket[day].push({
        name: (item.name || "").toString(),
        amount: Number(item.amount) || 0,
      });
    });
    Object.values(bucket).forEach(list => {
      list.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    });
    return bucket;
  }, [expenses]);

  const totalsByDay = useMemo(() => {
    return Array.from({ length: DAYS_IN_MONTH }, (_, idx) => {
      const day = idx + 1;
      return (expensesByDay[day] || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    });
  }, [expensesByDay]);

  const maxDailyTotal = useMemo(() => {
    return totalsByDay.reduce((max, value) => Math.max(max, value), 0);
  }, [totalsByDay]);

  const maxExpenseAmount = useMemo(() => {
    return (expenses || []).reduce((max, item) => Math.max(max, Number(item.amount) || 0), 0);
  }, [expenses]);

  const monthTotal = useMemo(() => {
    return (expenses || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [expenses]);

  useEffect(() => {
    if (!containerRef.current) return;
    const node = containerRef.current.querySelector(`[data-day="${todayDay}"]`);
    if (node) {
      const container = containerRef.current;
      const offset = node.offsetLeft - (container.clientWidth / 2) + (node.clientWidth / 2);
      container.scrollTo({ left: Math.max(offset, 0), behavior: "smooth" });
    }
  }, [todayDay, expensesByDay]);

  const dayList = useMemo(
    () => Array.from({ length: DAYS_IN_MONTH }, (_, idx) => idx + 1),
    []
  );

  return (
    <Box className="fixed-expenses-panel">
      <Box className="panel-header">
        <Typography variant="h5" fontWeight={600}>
          Frais fixes du mois
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Une frise fluide pour anticiper les sorties et plonger dans le détail de chaque journée.
        </Typography>
        <Chip
          label={`Total mensuel : ${monthTotal.toFixed(2)} €`}
          color="primary"
          variant="outlined"
          sx={{ mt: 2, fontWeight: 600 }}
        />
      </Box>

      {loading ? (
        <Box className="panel-loading">
          <CircularProgress size={48} />
          <Typography variant="body1" mt={2}>Chargement des frais fixes…</Typography>
        </Box>
      ) : error ? (
        <Box className="panel-error">
          <Typography variant="body2" color="error">{error}</Typography>
        </Box>
      ) : (
        <Box className="timeline-scroll" ref={containerRef}>
          <div className="timeline-track">
            {dayList.map(day => {
              const dayExpenses = expensesByDay[day] || [];
              const total = totalsByDay[day - 1] || 0;
              const dayStatus = computeDayStatus(day, todayDay);
              const isUpcomingFocus = dayStatus === "tomorrow" || dayStatus === "dayAfterTomorrow";
              const background = isUpcomingFocus ? getIntensityColor(total, maxDailyTotal) : undefined;

              return (
                <button
                  key={day}
                  type="button"
                  className={[
                    "day-card",
                    `status-${dayStatus}`,
                    dayExpenses.length ? "has-expenses" : "empty-day",
                  ].join(" ")}
                  data-day={day}
                  style={background ? { background } : undefined}
                  onClick={() => setSelectedDay(day)}
                >
                  <span className="day-number">{String(day).padStart(2, "0")}</span>
                  <span className="day-total">{total.toFixed(2)} €</span>
                  <span className="expense-stack">
                    {dayExpenses.map((expense, index) => {
                      const heightBase = maxExpenseAmount ? Math.max((expense.amount / maxExpenseAmount) * 60, 8) : 8;
                      return (
                        <span
                          key={`${expense.name}-${index}`}
                          className="expense-bar"
                          style={{
                            height: `${heightBase}px`,
                            animationDelay: `${index * 90}ms`,
                          }}
                          title={`${expense.name} • ${expense.amount.toFixed(2)} €`}
                        />
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        </Box>
      )}

      <Drawer
        anchor="bottom"
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        PaperProps={{ className: "day-detail-drawer" }}
      >
        <Box className="drawer-header">
          <Typography variant="h6" fontWeight={600}>
            Détails du {String(selectedDay || "").padStart(2, "0")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Les retraits prévus pour cette journée.
          </Typography>
        </Box>
        <Divider />
        <List dense>
          {(expensesByDay[selectedDay] || []).map((expense, index) => (
            <ListItem key={`${expense.name}-${index}`} className="drawer-list-item">
              <ListItemText
                primary={expense.name || "Sans intitulé"}
                secondary={`${expense.amount.toFixed(2)} €`}
              />
            </ListItem>
          ))}
          {(expensesByDay[selectedDay] || []).length === 0 && (
            <ListItem>
              <ListItemText
                primary="Aucune dépense enregistrée."
                secondary="Profites-en pour respirer !"
              />
            </ListItem>
          )}
        </List>
      </Drawer>
    </Box>
  );
};

export default FixedExpensesPanel;
