"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          Envie pelo WhatsApp <strong>{estado.telefone}</strong> a mensagem com o código <strong className="font-mono text-lg tracking-widest">{estado.codigo}</strong> para o número do sistema. Vale por 30 minutos.
        </Alert>
      ) : null}
      {telefoneAtual && !verificado && telefoneId ? (
        <form action={despacharNovoCodigo} className="flex flex-wrap items-center gap-2">
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
        <div className="min-w-56">
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300" htmlFor="telefone">
            {telefoneAtual ? "Trocar telefone (E.164)" : "Meu telefone do WhatsApp (E.164)"}
          </label>
          <Input id="telefone" name="telefone" placeholder="+5565999990000" required />
        </div>
        <Button type="submit" variante="secundaria" tamanho="sm" disabled={pendenteCadastro}>
          {pendenteCadastro ? "Salvando…" : "Cadastrar e gerar código"}
        </Button>
      </form>
    </div>
  );
}
