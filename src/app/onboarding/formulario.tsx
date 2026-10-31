"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Campo, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { criarEscritorio } from "./actions";

const PASSOS = ["Escritório", "Responsável", "Revisão"] as const;

/** Os três passos ficam montados (escondidos com `hidden`) para que nenhum dado se perca ao trocar de passo. */
export function FormularioOnboarding({ erro }: { erro?: string }) {
  const [passo, setPasso] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [valores, setValores] = useState({ nome: "", razao_social: "", cnpj: "", nome_completo: "", oab_numero: "", oab_uf: "" });

  const ultimo = passo === PASSOS.length - 1;
  const atualizar = (campo: keyof typeof valores) => (e: React.ChangeEvent<HTMLInputElement>) => setValores((v) => ({ ...v, [campo]: e.target.value }));

  return (
    <form
      className="flex w-full flex-col gap-5"
      action={async (fd) => {
        setEnviando(true);
        try {
          await criarEscritorio(fd);
        } finally {
          setEnviando(false);
        }
      }}
    >
      <ol className="grid grid-cols-3 gap-2" aria-label={`Passo ${passo + 1} de ${PASSOS.length}: ${PASSOS[passo]}`}>
        {PASSOS.map((nome, i) => {
          const feito = i < passo;
          const atual = i === passo;
          return (
            <li key={nome} className="flex min-w-0 flex-col gap-1.5" aria-current={atual ? "step" : undefined}>
              <span className={cn("h-1.5 rounded-full transition-colors", feito || atual ? "bg-marca-600" : "bg-zinc-200")} aria-hidden />
              <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-extrabold tabular-nums", feito ? "bg-emerald-600 text-white" : atual ? "bg-marca-600 text-white" : "bg-zinc-100 text-zinc-500")} aria-hidden>
                  {feito ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn("truncate", atual ? "text-zinc-950" : "text-zinc-500")}>{nome}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        Passo {passo + 1} de {PASSOS.length}: {PASSOS[passo]}
      </p>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}

      <div className={passo === 0 ? "flex flex-col gap-3" : "hidden"}>
        <Campo label="Nome do escritório" dica="Como aparece no painel e nos documentos.">
          <Input name="nome" required value={valores.nome} onChange={atualizar("nome")} />
        </Campo>
        <Campo label="Razão social (opcional)">
          <Input name="razao_social" value={valores.razao_social} onChange={atualizar("razao_social")} />
        </Campo>
        <Campo label="CNPJ (opcional)">
          <Input name="cnpj" inputMode="numeric" value={valores.cnpj} onChange={atualizar("cnpj")} />
        </Campo>
      </div>

      <div className={passo === 1 ? "flex flex-col gap-3" : "hidden"}>
        <Campo label="Seu nome completo">
          <Input name="nome_completo" required value={valores.nome_completo} onChange={atualizar("nome_completo")} />
        </Campo>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
          <Campo label="Número da OAB (opcional)">
            <Input name="oab_numero" value={valores.oab_numero} onChange={atualizar("oab_numero")} />
          </Campo>
          <Campo label="UF da OAB (opcional)">
            <Input name="oab_uf" maxLength={2} value={valores.oab_uf} onChange={atualizar("oab_uf")} className="uppercase" />
          </Campo>
        </div>
      </div>

      <div className={passo === 2 ? "flex flex-col gap-3 text-sm" : "hidden"}>
        <p className="text-zinc-700">Você será o sócio responsável por este escritório. Os demais membros entram por convite.</p>
        <dl className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-zinc-500">Escritório:</dt>
            <dd>
              <strong className="font-semibold text-zinc-950">{valores.nome || "(não informado)"}</strong>
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-zinc-500">Responsável:</dt>
            <dd>
              <strong className="font-semibold text-zinc-950">{valores.nome_completo || "(não informado)"}</strong>
            </dd>
          </div>
        </dl>
        <p className="text-xs text-zinc-500">Plano e valores: a confirmar. Nenhum plano é cobrado nesta etapa.</p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-4">
        <Button type="button" variante="contorno" disabled={passo === 0} onClick={() => setPasso((p) => Math.max(0, p - 1))}>
          Voltar
        </Button>
        {ultimo ? (
          <Button type="submit" disabled={enviando}>
            {enviando ? "Criando…" : "Criar escritório"}
          </Button>
        ) : (
          <Button type="button" onClick={() => setPasso((p) => Math.min(PASSOS.length - 1, p + 1))}>
            Continuar
          </Button>
        )}
      </div>
    </form>
  );
}
