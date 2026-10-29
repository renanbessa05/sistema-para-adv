import type { AreaDireito, TipoPeca } from "../ia/schemas/minutas";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "../ia/schemas/minutas";
import { delimitarDado } from "../ia/custo";

/**
 * Intake da minuta: as nove perguntas do Passo 2 da skill pré-preenchidas pelo banco (puro). O que o banco não
 * responde fica como pergunta para a advogada e, na mensagem ao modelo, como lacuna explícita.
 */
export interface IntakeMinuta {
  tipoPeca: TipoPeca;
  area: AreaDireito;
  modo: "A" | "B" | "C";
  /** Cliente(s) e polo. */
  partes: { nome: string; polo: string; ehCliente: boolean; documento: string | null }[];
  parteContraria: string | null;
  comarca: string | null;
  vara: string | null;
  grau: "primeiro" | "segundo";
  numeroCnj: string | null;
  /** Relato bruto da advogada e, no Modo B, o rascunho. */
  relato: string;
  rascunho: string | null;
  /** Documentos disponíveis (nome e id), para "Doc. NN". */
  documentos: { numero: number; nome: string; id: string; paginas: number | null }[];
  pedidos: string | null;
  urgencia: string | null;
  peculiaridades: string | null;
  /** Prazo em curso ligado à minuta. */
  prazo: { ato: string | null; dataFinal: string | null } | null;
  /** Publicação que originou (texto delimitado pelo servidor). */
  publicacaoTexto: string | null;
  /** Pontos aprovados de uma varredura (Parte II). */
  pontosVarredura: string[] | null;
  /** Dados do escritório para o preâmbulo. */
  advogada: { nome: string | null; oab: string | null; email: string | null };
}

export function perguntasPendentes(i: IntakeMinuta): string[] {
  const p: string[] = [];
  if (!i.partes.some((x) => x.ehCliente)) p.push("Quem é o cliente e qual polo ocupa?");
  if (!i.parteContraria) p.push("Quem é a parte contrária?");
  if (!i.comarca) p.push("Qual comarca (e vara)?");
  if (!i.relato.trim()) p.push("Narrativa cronológica dos fatos.");
  if (i.documentos.length === 0) p.push("Quais documentos o cliente tem?");
  if (!i.pedidos) p.push("O que exatamente o cliente quer obter?");
  if (!i.urgencia) p.push("Há pedido de tutela de urgência? Por quê?");
  return p;
}

/** Mensagem ao modelo com o intake inteiro (texto de fora delimitado). */
export function montarMensagemIntake(i: IntakeMinuta): string {
  const linhas = [
    `Peça: ${ROTULO_TIPO_PECA[i.tipoPeca]} · Área: ${ROTULO_AREA[i.area]} · Modo: ${i.modo} · Grau: ${i.grau === "segundo" ? "2º" : "1º"}`,
    `Processo: ${i.numeroCnj ?? "(ainda não ajuizado)"} · Comarca: ${i.comarca ?? "[[VERIFICAR: comarca]]"} · Vara: ${i.vara ?? "[[VERIFICAR: vara]]"}`,
    `Partes: ${i.partes.length ? i.partes.map((p) => `${p.nome} (${p.polo}${p.ehCliente ? ", CLIENTE" : ""}${p.documento ? `, doc. ${p.documento}` : ""})`).join("; ") : "[[VERIFICAR: partes]]"}`,
    `Parte contrária: ${i.parteContraria ?? "[[VERIFICAR: parte contrária]]"}`,
    `Advogada: ${i.advogada.nome ?? "[[VERIFICAR: advogada]]"} · OAB/MT ${i.advogada.oab ?? "[[VERIFICAR: OAB]]"} · e-mail PJe ${i.advogada.email ?? "[[VERIFICAR: e-mail]]"}`,
    `Documentos disponíveis: ${i.documentos.length ? i.documentos.map((d) => `Doc. ${String(d.numero).padStart(2, "0")} – ${d.nome}${d.paginas ? ` (${d.paginas} págs.)` : ""}`).join("; ") : "nenhum anexado"}`,
    `Pedidos pretendidos: ${i.pedidos ?? "[[VERIFICAR: pedidos]]"}`,
    `Urgência: ${i.urgencia ?? "não informada"}`,
    `Peculiaridades / jurisprudência conhecida: ${i.peculiaridades ?? "nenhuma informada"}`,
    i.prazo ? `Prazo em curso: ${i.prazo.ato ?? "ato"} até ${i.prazo.dataFinal ?? "?"}` : "Sem prazo em curso vinculado.",
    "",
    delimitarDado("relato", i.relato || "(sem relato)"),
  ];
  if (i.rascunho) linhas.push("", delimitarDado("rascunho_da_advogada", i.rascunho));
  if (i.publicacaoTexto) linhas.push("", delimitarDado("publicacao", i.publicacaoTexto));
  if (i.pontosVarredura?.length) linhas.push("", delimitarDado("pontos_aprovados_da_varredura", i.pontosVarredura.map((p, k) => `${k + 1}. ${p}`).join("\n")));
  const pendentes = perguntasPendentes(i);
  if (pendentes.length) linhas.push("", `Perguntas do intake sem resposta (trate como lacunas): ${pendentes.join(" ")}`);
  return linhas.join("\n");
}
