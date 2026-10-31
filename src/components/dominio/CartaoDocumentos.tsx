import { Download, File, FileImage, FileText, FileType, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { cn, formatarDataHora } from "@/lib/utils";
import { ROTULO_TIPO_DOCUMENTO, type Documento } from "@/server/documentos";
import { baixarDocumentoAction, enviarDocumentoAction, removerDocumentoAction } from "@/app/(painel)/documentos/actions";

/** Ícone e cor por tipo de arquivo (mime), para varrer a lista com o olho. */
function iconeDoArquivo(mime: string | null | undefined): { Icone: React.ComponentType<{ className?: string }>; classe: string } {
  if (mime === "application/pdf") return { Icone: FileText, classe: "bg-red-50 text-red-600" };
  if (mime?.startsWith("image/")) return { Icone: FileImage, classe: "bg-emerald-50 text-emerald-600" };
  if (mime?.includes("word") || mime?.includes("officedocument")) return { Icone: FileType, classe: "bg-marca-50 text-marca-600" };
  return { Icone: File, classe: "bg-zinc-100 text-zinc-500" };
}

/**
 * Bloco "Documentos" reaproveitado pelo processo e pelo cliente: lista, download auditado, upload e remoção.
 * Quem pode enviar: sócio, advogado e administrativo (RLS). Quem remove: advogado e sócio.
 */
export function CartaoDocumentos({ documentos, voltar, processoId, clienteId, papel, timeZone }: { documentos: Documento[]; voltar: string; processoId?: string; clienteId?: string; papel: string; timeZone: string }) {
  const podeEnviar = ["socio", "advogado", "administrativo"].includes(papel);
  const podeRemover = ["socio", "advogado"].includes(papel);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Documentos</CardTitle>
          <CardDescription className="mt-1">Autos, peças e anexos no armazenamento privado do escritório. PDF tem o texto extraído para a assistente ler.</CardDescription>
        </div>
        {documentos.length ? <span className="shrink-0 rounded-full bg-zinc-100 px-2 text-xs font-bold leading-5 text-zinc-600 tabular-nums">{documentos.length}</span> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {documentos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-6 text-center text-sm text-zinc-500">Nenhum documento.</div>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {documentos.map((d) => {
              const { Icone, classe } = iconeDoArquivo(d.mime);
              return (
                <li key={d.id} className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[36px_minmax(0,1fr)_auto]">
                  <span className={cn("grid h-9 w-9 place-items-center rounded-lg", classe)} aria-hidden>
                    <Icone className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate font-semibold text-zinc-950" title={d.nome}>
                        {d.nome}
                      </span>
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
                    </span>
                    <span className="block truncate text-xs text-zinc-500 tabular-nums">
                      {ROTULO_TIPO_DOCUMENTO[d.tipo] ?? d.tipo} · {tamanhoLegivel(d.tamanho)}
                      {d.paginas ? ` · ${d.paginas} págs.` : ""} · {formatarDataHora(d.criado_em, timeZone)}
                    </span>
                  </span>
                  <span className="col-start-2 flex items-center gap-1.5 sm:col-start-3">
                    <form action={baixarDocumentoAction.bind(null, d.id)}>
                      <input type="hidden" name="voltar" value={voltar} />
                      <Button type="submit" variante="contorno" tamanho="sm">
                        <Download aria-hidden />
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
              );
            })}
          </ul>
        )}
        {podeEnviar ? (
          <form action={enviarDocumentoAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-3.5">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Enviar documento
            </p>
            <input type="hidden" name="voltar" value={voltar} />
            {processoId ? <input type="hidden" name="processo_id" value={processoId} /> : null}
            {clienteId ? <input type="hidden" name="cliente_id" value={clienteId} /> : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
              <Campo label="Arquivo">
                <Input type="file" name="arquivo" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg" required />
              </Campo>
              <Campo label="Tipo">
                <Select name="tipo" defaultValue={processoId ? "autos" : "anexo"} aria-label="Tipo do documento">
                  {Object.entries(ROTULO_TIPO_DOCUMENTO)
                    .filter(([v]) => !["exportacao", "memoria_calculo"].includes(v))
                    .map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                </Select>
              </Campo>
              <Button type="submit" variante="secundaria" className="h-10 w-full sm:w-auto">
                <Upload aria-hidden />
                Enviar
              </Button>
            </div>
            <p className="text-xs text-zinc-500">Aceita PDF, DOCX, TXT, MD e imagens. Use &ldquo;Autos&rdquo; para o PDF do PJe: o texto é extraído para a assistente ler.</p>
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
