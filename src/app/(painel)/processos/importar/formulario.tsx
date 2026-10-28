"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { acaoImportacao, type EstadoImportacao } from "../actions";

const POLO: Record<string, string> = { ativo: "ativo", passivo: "passivo", terceiro: "terceiro", outro: "outro" };

export function FormularioImportacao() {
  const [estado, despachar, pendente] = useActionState<EstadoImportacao, FormData>(acaoImportacao, { etapa: "inicio" });

  if (estado.etapa === "inicio") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>1. Enviar arquivo</CardTitle>
        </CardHeader>
        <CardContent>
          {estado.erro ? (
            <Alert tom="perigo" className="mb-3">
              {estado.erro}
            </Alert>
          ) : null}
          <form action={despachar} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="etapa" value="previsualizar" />
            <div className="min-w-64 flex-1">
              <label className="mb-1 block text-sm font-medium" htmlFor="arquivo">
                Arquivo CSV (até 5 MB)
              </label>
              <Input id="arquivo" name="arquivo" type="file" accept=".csv,text/csv,text/plain" required className="py-1.5" />
            </div>
            <Button type="submit" disabled={pendente}>
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
          <CardHeader>
            <CardTitle>2. Pré-visualização de {nomeArquivo}</CardTitle>
            <CardDescription>
              Separador &quot;{parse.separador}&quot; · {parse.validas.length} linha(s) válida(s) · {parse.rejeitadas.length} rejeitada(s). Desmarque as linhas que não quer importar.
            </CardDescription>
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
                      <TD>
                        <input type="checkbox" name="linha" value={l.linha} defaultChecked aria-label={`Importar linha ${l.linha}`} />
                      </TD>
                      <TD>{l.linha}</TD>
                      <TD className="font-mono text-xs">
                        {l.numero_cnj_mascara}
                        {l.tribunal_sigla && l.tribunal_sigla !== "TJMT" ? <Badge className="ml-1">{l.tribunal_sigla}</Badge> : null}
                      </TD>
                      <TD>
                        {l.cliente}
                        {l.cpf_cnpj ? <span className="block text-xs text-zinc-500">{l.cpf_cnpj}</span> : null}
                      </TD>
                      <TD>{POLO[l.polo]}</TD>
                      <TD>{l.parte_contraria ?? "—"}</TD>
                      <TD>{l.comarca ?? "—"}</TD>
                      <TD>
                        {l.responsavel ?? "—"}
                        {l.colaboradores.length ? <span className="block text-xs text-zinc-500">+ {l.colaboradores.join(", ")}</span> : null}
                      </TD>
                      <TD>{l.sigiloso ? <Badge tom="perigo">sim</Badge> : "não"}</TD>
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

        <div className="flex justify-end gap-2">
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
            <ul className="list-disc pl-5 text-sm">
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
      <div className="flex justify-end gap-2">
        <Button type="submit" variante="contorno" disabled={pendente}>
          Importar outro arquivo
        </Button>
        <Link href="/processos" className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900">
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
            <TD>{r.linha || "—"}</TD>
            <TD className="font-mono text-xs">{r.numero_cnj ?? "—"}</TD>
            <TD>{r.motivo}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
