// Camembert montrant la répartition du chiffre d'affaires par mode de paiement
import React from 'react';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { getPaymentColor } from '../utils/dataUtils';

function PaymentPieChart({ payments }) {
  // Conversion de l'objet en tableau et arrondi des valeurs
  const data = Object.entries(payments || {}).map(([name, value]) => ({
    name, value: Math.round(value * 100) / 100
  }));
  const [activeLegend, setActiveLegend] = React.useState(null);
  const formatEUR = (value) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    return safeValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  };

  const renderLegend = ({ payload }) => {
    if (!payload || !payload.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'visible' }}>
        {payload.map((entry) => {
          const label = entry.value;
          const amount = Number(entry.payload?.value);
          const isActive = activeLegend === label;
          return (
            <div
              key={label}
              onMouseEnter={() => setActiveLegend(label)}
              onMouseLeave={() => setActiveLegend(null)}
              onFocus={() => setActiveLegend(label)}
              onBlur={() => setActiveLegend(null)}
              tabIndex={0}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'default',
                outline: 'none'
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: entry.color,
                  flexShrink: 0
                }}
              />
              <span style={{ color: '#3f3f3f' }}>{label}</span>
              <span
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: '50%',
                  marginLeft: 8,
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: 'rgba(0, 0, 0, 0.05)',
                  color: '#2b2b2b',
                  fontSize: 11,
                  lineHeight: 1.2,
                  opacity: isActive ? 1 : 0,
                  transform: `translate(${isActive ? '0' : '-6px'}, -50%)`,
                  transition: 'opacity 180ms ease, transform 180ms ease',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 2
                }}
              >
                {formatEUR(amount)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!data.length) {
    return <div style={{ color: '#bdbdbd', fontSize: 12 }}>Aucun paiement</div>;
  }

  return (
    <ResponsiveContainer width='100%' height={120}>
      <PieChart>
        <Pie
          data={data}
          dataKey='value'
          nameKey='name'
          cx='50%'
          cy='50%'
          innerRadius={28}
          outerRadius={45}
          fill='#8884d8'
          labelLine={false}
          isAnimationActive
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={getPaymentColor(entry.name)} />
          ))}
        </Pie>
        <Legend
        verticalAlign='middle'
        align='right'
        iconType='circle'
        layout='vertical'
        content={renderLegend}
        wrapperStyle={{
          fontSize: 12,
          overflow: 'visible',
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          minHeight: 100 // Hauteur minimale pour un affichage correct
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default PaymentPieChart;
