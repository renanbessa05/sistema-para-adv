"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { cadastrarTelefone, gerarNovoCodigo, type EstadoTelefone } from "./actions";

/** Cadastro do próprio telefone e exibição do código de verificação (fica só na tela, não na URL). */
export function FormularioTelefone({ telefoneAtual, telefoneId, verificado }: { telefoneAtual: string | null; telefoneId: string | null; verificado: boolean }) {
  const [cadastro, despacharCadastro, pendenteCadastro] = useActionState<EstadoTelefone, FormData>(cadastrarTelefone, {});
  const [novoCodigo, despacharNovoCodigo, pendenteCodigo] = useActionState<EstadoTelefone, FormData>(gerarNovoCodigo, {});
  const estado = novoCodigo.codigo ? novoCodigo : cadastro;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {estado.erro ? <Alert tom="perigo">{estado.erro}</Alert> : null}
      {estado.codigo ? (
        <Alert tom="sucesso" titulo="Código de verificação">
          Envie pelo WhatsApp <strong>{estado.telefone}</strong> a mensagem com o código <strong className="mx-1 inline-block rounded-lg bg-white px-2.5 py-0.5 font-mono text-lg font-bold tracking-[0.2em] text-emerald-800 shadow-xs ring-1 ring-emerald-200">{estado.codigo}</strong> para o número do sistema. Vale por 30 minutos.
        </Alert>
      ) : null}
      {telefoneAtual && !verificado && telefoneId ? (
        <form action={despacharNovoCodigo} className="flex flex-wrap items-center gap-2 rounded-xl border border-ouro-300 bg-ouro-50 px-3 py-2 text-ouro-700">
          <input type="hidden" name="telefone_id" value={telefoneId} />
          <input type="hidden" name="telefone" value={telefoneAtual} />
          <span>
            {telefoneAtual} ainda não verificado.
          </span>
          <Button type="submit" variante="secundaria" tamanho="sm" disabled={pendenteCodigo}>
            {pendenteCodigo ? "Gerando…" : "Gerar código"}
          </Button>
        </form>
      ) : null}
      <form action={despacharCadastro} className="flex flex-wrap items-end gap-2">
        <Campo label={telefoneAtual ? "Trocar telefone" : "Meu telefone do WhatsApp"} dica="Com DDI e DDD, só números: +5565999990000" className="min-w-56 flex-1">
          <Input id="telefone" name="telefone" placeholder="+5565999990000" inputMode="tel" required />
        </Campo>
        <Button type="submit" variante="secundaria" className="mb-5" disabled={pendenteCadastro}>
          {pendenteCadastro ? "Salvando…" : "Cadastrar e gerar código"}
        </Button>
      </form>
    </div>
  );
}
