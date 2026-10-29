import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatarDataHora } from "@/lib/utils";
import { ROTULO_TIPO_DOCUMENTO, type Documento } from "@/server/documentos";
import { baixarDocumentoAction, enviarDocumentoAction, removerDocumentoAction } from "@/app/(painel)/documentos/actions";

/**
 * Bloco "Documentos" reaproveitado pelo processo e pelo cliente: lista, download auditado, upload e remoção.
 * Quem pode enviar: sócio, advogado e administrativo (RLS). Quem remove: advogado e sócio.
 */
export function CartaoDocumentos({ documentos, voltar, processoId, clienteId, papel, timeZone }: { documentos: Documento[]; voltar: string; processoId?: string; clienteId?: string; papel: string; timeZone: string }) {
  const podeEnviar = ["socio", "advogado", "administrativo"].includes(papel);
  const podeRemover = ["socio", "advogado"].includes(papel);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos</CardTitle>
        <CardDescription>Autos, peças e anexos no armazenamento privado do escritório. PDF tem o texto extraído para a assistente ler.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {documentos.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum documento.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {documentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{d.nome}</span>
                  <span className="text-xs text-zinc-500">
                    {ROTULO_TIPO_DOCUMENTO[d.tipo] ?? d.tipo} · {tamanhoLegivel(d.tamanho)}
                    {d.paginas ? ` · ${d.paginas} págs.` : ""} · {formatarDataHora(d.criado_em, timeZone)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {d.mime === "application/pdf" ? (
                    d.texto_extraido_em ? (
                      <Badge tom={d.extracao_erro === "sem_texto" ? "alerta" : "sucesso"}>{d.extracao_erro === "sem_texto" ? "sem texto (escaneado)" : "texto extraído"}</Badge>
                    ) : d.extracao_erro ? (
                      <Badge tom="perigo" title={d.extracao_erro}>
                        falha na extração
                      </Badge>
                    ) : (
                      <Badge tom="contorno">extraindo…</Badge>
                    )
                  ) : null}
                  <form action={baixarDocumentoAction.bind(null, d.id)}>
                    <input type="hidden" name="voltar" value={voltar} />
                    <Button type="submit" variante="contorno" tamanho="sm">
                      Baixar
                    </Button>
                  </form>
                  {podeRemover ? (
                    <form action={removerDocumentoAction.bind(null, d.id)}>
                      <input type="hidden" name="voltar" value={voltar} />
                      <Button type="submit" variante="fantasma" tamanho="sm" aria-label={`Remover ${d.nome}`}>
                        Remover
                      </Button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {podeEnviar ? (
          <form action={enviarDocumentoAction} className="grid gap-2 rounded-md border border-dashed border-zinc-300 p-2 sm:grid-cols-[1fr_auto_auto] dark:border-zinc-700">
            <input type="hidden" name="voltar" value={voltar} />
            {processoId ? <input type="hidden" name="processo_id" value={processoId} /> : null}
            {clienteId ? <input type="hidden" name="cliente_id" value={clienteId} /> : null}
            <Input type="file" name="arquivo" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg" required />
            <Select name="tipo" defaultValue={processoId ? "autos" : "anexo"} aria-label="Tipo do documento">
              {Object.entries(ROTULO_TIPO_DOCUMENTO)
                .filter(([v]) => !["exportacao", "memoria_calculo"].includes(v))
                .map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
            </Select>
            <Button type="submit" variante="secundaria" tamanho="sm">
              Enviar
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
