// Encadré récapitulatif des montants URSSAF et nuitées par gîte
import React from 'react';
import { Paper, Typography, Stack, Button } from '@mui/material';
import { computeUrssaf, computeChequeVirementNights } from '../utils/dataUtils';

function UrssafBox({ data, selectedYear, selectedMonth }) {
  const { urssafSeb, urssafSoazig } = computeUrssaf(data, selectedYear, selectedMonth);
  const nightsByGite = computeChequeVirementNights(data, selectedYear, selectedMonth);
  const gites = ['Phonsine', 'Gree', 'Edmond', 'Liberté'];
  const handleCopy = (value) => {
    const rounded = Math.round(value);
    const text = String(rounded);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  return (
    <Paper elevation={0} sx={{ bgcolor: '#f7f8fa', borderRadius: 3, p: 2, mb: 1, border: '1px solid #e0e0e0' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems='center' justifyContent='center'>
        <Typography component="div">
          <span style={{ fontWeight: 700, color: '#2D8CFF' }}>URSSAF Sébastien : </span>
          <span style={{ fontWeight: 500 }}>
            {urssafSeb.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </span>
          <Button
            variant="text"
            size="small"
            onClick={() => handleCopy(urssafSeb)}
            sx={{ ml: 1, px: 0.75, minWidth: 0, fontSize: '0.7rem', textTransform: 'none', color: 'text.secondary' }}
          >
            copier
          </Button>
        </Typography>
        <Typography component="div">
          <span style={{ fontWeight: 700, color: '#43B77D' }}>URSSAF Soazig : </span>
          <span style={{ fontWeight: 500 }}>
            {urssafSoazig.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </span>
          <Button
            variant="text"
            size="small"
            onClick={() => handleCopy(urssafSoazig)}
            sx={{ ml: 1, px: 0.75, minWidth: 0, fontSize: '0.7rem', textTransform: 'none', color: 'text.secondary' }}
          >
            copier
          </Button>
        </Typography>
      </Stack>
      <Stack direction='row' spacing={2} justifyContent='center' mt={1}>
        {gites.map(name => (
          <Stack key={name} spacing={0.5} alignItems='center'>
            <Typography variant='caption' fontWeight={700}>{name}</Typography>
            <Typography variant='caption'>{nightsByGite[name] || 0} nuitées</Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

export default UrssafBox;
