// Camembert affichant la répartition des nuitées par type de paiement
import React from 'react';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { getPaymentColor } from '../utils/dataUtils';

function NuiteesPieChart({ nuitees }) {
  // Transformation de l'objet en tableau exploitable par Recharts
  const data = Object.entries(nuitees || {})
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  if (!data.length) {
    return <div style={{ color: '#bdbdbd', fontSize: 12 }}>Aucune nuitée</div>;
  }

  return (
    <ResponsiveContainer width='100%' height={120}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
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
          formatter={(value, entry) => `${value} : ${entry.payload.value}`}
          wrapperStyle={{
            fontSize: 12,
            marginLeft: 8,
            top: 15
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default NuiteesPieChart;
