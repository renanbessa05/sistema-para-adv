import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Vinculo } from "@/server/sessao";
import { trocarEscritorio } from "./seletor-actions";

/** Seletor do header: aparece só quando o usuário tem mais de um escritório disponível. */
export function SeletorEscritorio({ vinculos, atual }: { vinculos: Vinculo[]; atual: string }) {
  if (vinculos.length < 2) return null;
  return (
    <form action={trocarEscritorio} className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor="seletor-escritorio">
        Escritório
      </label>
      <span className="relative">
        <Building2 className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
        <select id="seletor-escritorio" name="escritorio_id" defaultValue={atual} className="h-9 max-w-44 rounded-lg border border-zinc-200 bg-white pr-2 pl-8 text-sm text-zinc-800 shadow-xs">
          {vinculos.map((v) => (
            <option key={v.escritorioId} value={v.escritorioId}>
              {v.nome}
              {v.origem === "acesso_suporte" ? " (suporte)" : ""}
            </option>
          ))}
        </select>
      </span>
      <Button type="submit" variante="contorno" tamanho="sm">
        Trocar
      </Button>
    </form>
  );
}
