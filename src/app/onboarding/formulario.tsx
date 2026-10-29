"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
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
      className="flex w-full max-w-md flex-col gap-4"
      action={async (fd) => {
        setEnviando(true);
        try {
          await criarEscritorio(fd);
        } finally {
          setEnviando(false);
        }
      }}
    >
      <p className="text-sm text-zinc-500">
        Passo {passo + 1} de {PASSOS.length}: {PASSOS[passo]}
      </p>
      {erro ? <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{erro}</p> : null}

      <div className={passo === 0 ? "flex flex-col gap-3" : "hidden"}>
        <Campo label="Nome do escritório">
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
        <Campo label="Número da OAB (opcional)">
          <Input name="oab_numero" value={valores.oab_numero} onChange={atualizar("oab_numero")} />
        </Campo>
        <Campo label="UF da OAB (opcional)">
          <Input name="oab_uf" maxLength={2} value={valores.oab_uf} onChange={atualizar("oab_uf")} />
        </Campo>
      </div>

      <div className={passo === 2 ? "flex flex-col gap-2 text-sm" : "hidden"}>
        <p>Você será o sócio responsável por este escritório. Os demais membros entram por convite.</p>
        <p>Escritório: <strong>{valores.nome || "(não informado)"}</strong></p>
        <p>Responsável: <strong>{valores.nome_completo || "(não informado)"}</strong></p>
        <p className="text-zinc-500">Plano e valores: a confirmar. Nenhum plano é cobrado nesta etapa.</p>
      </div>

      <div className="flex items-center justify-between gap-2">
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
