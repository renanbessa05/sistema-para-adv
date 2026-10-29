"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adicionarContato, alterarConsentimento, desativarContato, gerarCodigoContato, type EstadoCodigo } from "./contatos-actions";

export interface ContatoCliente {
  id: string;
  telefone_e164: string;
  verificado_em: string | null;
  opt_in_em: string | null;
  opt_out_em: string | null;
}

/** Contatos de WhatsApp do cliente: cadastro, código de verificação e autorização. Nada é enviado daqui. */
export function CartaoContatos({ clienteId, contatos, podeGerir }: { clienteId: string; contatos: ContatoCliente[]; podeGerir: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp do cliente</CardTitle>
        <CardDescription>
          Para receber mensagens do escritório, o número precisa ser confirmado (o cliente digita o código no WhatsApp) e autorizado por você. Mensagens livres só saem depois de aprovadas. O envio geral depende de Configurações → Atendimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {contatos.length === 0 ? <p className="text-sm text-zinc-500">Nenhum telefone de WhatsApp cadastrado.</p> : null}
        {contatos.map((c) => (
          <LinhaContato key={c.id} clienteId={clienteId} contato={c} podeGerir={podeGerir} />
        ))}
        {podeGerir ? (
          <form action={adicionarContato} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="cliente_id" value={clienteId} />
            <label className="flex flex-col gap-1 text-sm">
              Telefone (DDI+DDD+número)
              <input name="telefone" required placeholder="+5565999990000" className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
            </label>
            <Button type="submit" variante="contorno">
              Adicionar telefone
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LinhaContato({ clienteId, contato, podeGerir }: { clienteId: string; contato: ContatoCliente; podeGerir: boolean }) {
  const [estado, acaoCodigo, pendente] = useActionState<EstadoCodigo, FormData>(gerarCodigoContato, {});
  const verificado = Boolean(contato.verificado_em);
  const autorizado = Boolean(contato.opt_in_em) && !contato.opt_out_em;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{contato.telefone_e164}</span>
        <Badge tom={verificado ? "sucesso" : "alerta"}>{verificado ? "confirmado" : "não confirmado"}</Badge>
        <Badge tom={autorizado ? "sucesso" : "contorno"}>{autorizado ? "autorizado" : contato.opt_out_em ? "não autorizado (pediu para sair)" : "sem autorização"}</Badge>
      </div>
      {podeGerir ? (
        <div className="flex flex-wrap items-center gap-2">
          {!verificado ? (
            <form action={acaoCodigo}>
              <input type="hidden" name="contato_id" value={contato.id} />
              <Button type="submit" variante="contorno" disabled={pendente}>
                Gerar código de confirmação
              </Button>
            </form>
          ) : null}
          {verificado && !autorizado ? (
            <form action={alterarConsentimento}>
              <input type="hidden" name="cliente_id" value={clienteId} />
              <input type="hidden" name="contato_id" value={contato.id} />
              <input type="hidden" name="concede" value="1" />
              <Button type="submit" variante="contorno">
                Registrar autorização do cliente
              </Button>
            </form>
          ) : null}
          {autorizado ? (
            <form action={alterarConsentimento}>
              <input type="hidden" name="cliente_id" value={clienteId} />
              <input type="hidden" name="contato_id" value={contato.id} />
              <input type="hidden" name="concede" value="0" />
              <Button type="submit" variante="contorno">
                Revogar autorização
              </Button>
            </form>
          ) : null}
          <form action={desativarContato}>
            <input type="hidden" name="cliente_id" value={clienteId} />
            <input type="hidden" name="contato_id" value={contato.id} />
            <Button type="submit" variante="fantasma">
              Desativar
            </Button>
          </form>
        </div>
      ) : null}
      {estado.codigo ? (
        <p className="rounded-md bg-zinc-100 p-2 dark:bg-zinc-900">
          Código: <strong className="font-mono text-base">{estado.codigo}</strong>. Vale por 30 minutos. Peça ao cliente que digite este código, sozinho, no WhatsApp do escritório.
        </p>
      ) : null}
      {estado.erro ? <p className="text-red-600">{estado.erro}</p> : null}
    </div>
  );
}
