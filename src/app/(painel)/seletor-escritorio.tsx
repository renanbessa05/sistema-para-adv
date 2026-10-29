import { Button } from "@/components/ui/button";
import type { Vinculo } from "@/server/sessao";
import { trocarEscritorio } from "./seletor-actions";

/** Seletor do header: aparece só quando o usuário tem mais de um escritório disponível. */
export function SeletorEscritorio({ vinculos, atual }: { vinculos: Vinculo[]; atual: string }) {
  if (vinculos.length < 2) return null;
  return (
    <form action={trocarEscritorio} className="flex items-center gap-1">
      <label className="sr-only" htmlFor="seletor-escritorio">
        Escritório
      </label>
      <select id="seletor-escritorio" name="escritorio_id" defaultValue={atual} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900">
        {vinculos.map((v) => (
          <option key={v.escritorioId} value={v.escritorioId}>
            {v.nome}
            {v.origem === "acesso_suporte" ? " (suporte)" : ""}
          </option>
        ))}
      </select>
      <Button type="submit" variante="contorno">
        Trocar
      </Button>
    </form>
  );
}
