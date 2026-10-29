"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SerieGrafico {
  chave: string;
  rotulo: string;
  cor: string;
}

/** Barras agrupadas por categoria (ex.: pessoa), uma barra por série. Recebe dados já prontos; não calcula nada. */
export function GraficoBarras({ dados, categoria, series, altura = 280 }: { dados: Record<string, string | number>[]; categoria: string; series: SerieGrafico[]; altura?: number }) {
  return (
    <div style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
          <XAxis dataKey={categoria} tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Bar key={s.chave} dataKey={s.chave} name={s.rotulo} fill={s.cor} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
