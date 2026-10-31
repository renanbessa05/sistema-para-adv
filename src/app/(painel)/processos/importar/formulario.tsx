"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Upload } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { acaoImportacao, type EstadoImportacao } from "../actions";

const POLO: Record<string, string> = { ativo: "ativo", passivo: "passivo", terceiro: "terceiro", outro: "outro" };

/** Número da etapa, em círculo azul, ao lado do título do cartão. */
function Etapa({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marca-600 text-[13px] font-bold text-white shadow-marca tabular-nums" aria-hidden>
      {n}
    </span>
  );
}

export function FormularioImportacao() {
  const [estado, despachar, pendente] = useActionState<EstadoImportacao, FormData>(acaoImportacao, { etapa: "inicio" });

  if (estado.etapa === "inicio") {
    return (
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <Etapa n={1} />
          <CardTitle>1. Enviar arquivo</CardTitle>
        </CardHeader>
        <CardContent>
          {estado.erro ? (
            <Alert tom="perigo" className="mb-3">
              {estado.erro}
            </Alert>
          ) : null}
          <form action={despachar} className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-4 sm:flex-row sm:items-end">
            <input type="hidden" name="etapa" value="previsualizar" />
            <div className="min-w-0 flex-1">
              <Label htmlFor="arquivo">Arquivo CSV (até 5 MB)</Label>
              <Input id="arquivo" name="arquivo" type="file" accept=".csv,text/csv,text/plain" required className="py-1.5" />
            </div>
            <Button type="submit" disabled={pendente} className="h-10 w-full sm:w-auto">
              <Upload aria-hidden />
              {pendente ? "Lendo…" : "Pré-visualizar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (estado.etapa === "previa") {
    const { parse, nomeArquivo } = estado;
    return (
      <form action={despachar} className="flex flex-col gap-4">
        <Card>
          <CardHeader className="flex-row items-start gap-3">
            <Etapa n={2} />
            <div className="min-w-0">
              <CardTitle className="break-words">2. Pré-visualização de {nomeArquivo}</CardTitle>
              <CardDescription className="mt-1">
                Separador &quot;{parse.separador}&quot; · <span className="font-semibold text-emerald-700 tabular-nums">{parse.validas.length}</span> linha(s) válida(s) · <span className={parse.rejeitadas.length ? "font-semibold text-red-700 tabular-nums" : "tabular-nums"}>{parse.rejeitadas.length}</span> rejeitada(s). Desmarque as linhas que não quer importar.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {parse.validas.length === 0 ? (
              <Alert tom="alerta">Nenhuma linha válida. Corrija o arquivo e envie de novo.</Alert>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Importar</TH>
                    <TH>Linha</TH>
                    <TH>Número CNJ</TH>
                    <TH>Cliente</TH>
                    <TH>Polo</TH>
                    <TH>Parte contrária</TH>
                    <TH>Comarca</TH>
                    <TH>Responsável</TH>
                    <TH>Sigiloso</TH>
                  </TR>
                </THead>
                <TBody>
                  {parse.validas.map((l) => (
                    <TR key={l.linha}>
                      <TD className="text-center">
                        <input type="checkbox" name="linha" value={l.linha} defaultChecked aria-label={`Importar linha ${l.linha}`} className="h-4 w-4 rounded border-zinc-300 accent-marca-600" />
                      </TD>
                      <TD className="text-zinc-500 tabular-nums">{l.linha}</TD>
                      <TD className="font-mono text-xs font-semibold whitespace-nowrap text-zinc-950">
                        {l.numero_cnj_mascara}
                        {l.tribunal_sigla && l.tribunal_sigla !== "TJMT" ? <Badge className="ml-1.5">{l.tribunal_sigla}</Badge> : null}
                      </TD>
                      <TD className="font-medium text-zinc-800">
                        {l.cliente}
                        {l.cpf_cnpj ? <span className="block font-mono text-xs font-normal text-zinc-500">{l.cpf_cnpj}</span> : null}
                      </TD>
                      <TD className="text-zinc-600">{POLO[l.polo]}</TD>
                      <TD className="text-zinc-600">{l.parte_contraria ?? "—"}</TD>
                      <TD className="text-zinc-600">{l.comarca ?? "—"}</TD>
                      <TD className="text-zinc-600">
                        {l.responsavel ?? "—"}
                        {l.colaboradores.length ? <span className="block text-xs text-zinc-500">+ {l.colaboradores.join(", ")}</span> : null}
                      </TD>
                      <TD>{l.sigiloso ? <Badge tom="perigo">sim</Badge> : <span className="text-zinc-500">não</span>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {parse.rejeitadas.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Linhas rejeitadas na leitura</CardTitle>
              <CardDescription>Não serão importadas. Corrija no arquivo e envie de novo se precisar.</CardDescription>
            </CardHeader>
            <CardContent>
              <TabelaRejeitadas itens={parse.rejeitadas} />
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" variante="contorno" name="etapa" value="reiniciar" disabled={pendente}>
            Enviar outro arquivo
          </Button>
          {parse.validas.length > 0 ? (
            <Button type="submit" name="etapa" value="confirmar" disabled={pendente}>
              {pendente ? "Importando…" : `Confirmar importação`}
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  const { relatorio, erroDatajud } = estado;
  return (
    <form action={despachar} className="flex flex-col gap-4">
      <input type="hidden" name="etapa" value="reiniciar" />
      <Alert tom={relatorio.processosCriados > 0 ? "sucesso" : "alerta"} titulo="Importação concluída">
        {relatorio.processosCriados} processo(s) e {relatorio.clientesCriados} cliente(s) criados. {relatorio.rejeitadas.length} linha(s) rejeitada(s).
        {erroDatajud ? ` Enriquecimento pelo DataJud não rodou agora (${erroDatajud}); a rotina diária completa os dados.` : relatorio.processosCriados > 0 ? " Dados do DataJud solicitados." : ""}
      </Alert>
      {relatorio.avisos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Avisos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-700">
              {relatorio.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {relatorio.rejeitadas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Relatório de rejeições</CardTitle>
          </CardHeader>
          <CardContent>
            <TabelaRejeitadas itens={relatorio.rejeitadas} />
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" variante="contorno" disabled={pendente}>
          Importar outro arquivo
        </Button>
        <Link href="/processos" className={classesBotao({ variante: "primaria" })}>
          Ver processos
        </Link>
      </div>
    </form>
  );
}

function TabelaRejeitadas({ itens }: { itens: { linha: number; numero_cnj: string | null; motivo: string }[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Linha</TH>
          <TH>Número CNJ</TH>
          <TH>Motivo</TH>
        </TR>
      </THead>
      <TBody>
        {itens.map((r, i) => (
          <TR key={`${r.linha}-${i}`}>
            <TD className="text-zinc-500 tabular-nums">{r.linha || "—"}</TD>
            <TD className="font-mono text-xs whitespace-nowrap">{r.numero_cnj ?? "—"}</TD>
            <TD className="text-red-700">{r.motivo}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
