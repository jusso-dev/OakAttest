'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useUserTimeZone } from '@/components/timezone/UserTimezone';

type Point = { strategy: string; maturity: number; recordedAt: string };

export function EssentialEightChart({ data }: { data: Point[] }) {
  const { formatDate } = useUserTimeZone();
  // Group points into one line per strategy, sorted by date.
  const byStrategy = new Map<string, Array<{ x: string; y: number }>>();
  for (const p of data) {
    const arr = byStrategy.get(p.strategy) ?? [];
    arr.push({ x: formatDate(p.recordedAt), y: p.maturity });
    byStrategy.set(p.strategy, arr);
  }

  // Build a wide-table form suitable for Recharts LineChart with multiple series.
  const allDates = Array.from(new Set(data.map((d) => formatDate(d.recordedAt)))).sort();
  const rows = allDates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const [strategy, points] of byStrategy.entries()) {
      const point = points.find((p) => p.x === date);
      if (point) row[strategy] = point.y;
    }
    return row;
  });

  const colours = ['#0f3f2c', '#1e293b', '#475569', '#0e7490', '#b91c1c', '#a16207', '#14543b', '#64748b'];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={rows}>
          <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
          <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} stroke="#64748b" fontSize={11} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {Array.from(byStrategy.keys()).map((strategy, i) => (
            <Line
              key={strategy}
              type="monotone"
              dataKey={strategy}
              stroke={colours[i % colours.length]}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
