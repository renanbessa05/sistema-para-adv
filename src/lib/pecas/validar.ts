import { extrairTodosCnj, validarDigitosCnj } from "../cnj/numero-cnj";
import { listarLacunas } from "../ia/lacunas";

/**
 * Validação determinística da peça (regra 6 de docs/regras/agentes.md): o que dá para conferir por código não é
 * pedido à IA. Devolve um semáforo por item e os números que o banco guarda em minuta_versoes.validacao.
 */
export interface ContextoValidacao {
  /** CNJ do processo vinculado (dígitos ou com máscara), quando houver. */
  numeroCnjProcesso: string | null;
  /** Rótulos de documentos existentes ("Doc. 01"...), ou null para não conferir. */
  documentosExistentes: number[] | null;
  /** Ids de jurisprudência devolvidos pela ferramenta de busca nesta minuta. */
  citacoesConfirmadas: string[];
  grau: "primeiro" | "segundo";
  tipoPeca: string;
  /** Tempestividade calculada pelo motor de prazos (null quando não há prazo). */
  tempestivo: boolean | null;
}

export type Situacao = "ok" | "atencao" | "falta" | "nao_aplicavel";

export interface ItemValidacao {
  id: string;
  rotulo: string;
  situacao: Situacao;
  detalhe: string | null;
}

export interface ResultadoValidacao {
  itens: ItemValidacao[];
  lacunas: number;
  docs_citados: number[];
  docs_inexistentes: number[];
  citacoes_sem_id: string[];
  cnj_encontrado: string | null;
  laudas_estimadas: number;
  pronta: boolean;
}

const RE_DOC = /Doc\.?\s*(\d{1,3})/gi;
// Referências numeradas a precedentes que precisam estar confirmadas na base
const RE_CITACAO = /\b(?:Súmula(?:\s+Vinculante)?\s*n?º?\s*\d+|REsp\s*\d[\d.]*|AgInt\s*(?:no\s*)?(?:REsp|AREsp)\s*\d[\d.]*|AREsp\s*\d[\d.]*|RE\s*\d[\d.]{3,}|Tema\s*(?:Repetitivo\s*)?n?º?\s*\d+|Apelação\s+Cível\s*n?º?\s*[\d.-]+|Agravo\s+de\s+Instrumento\s*n?º?\s*[\d.-]+)/gi;

export function validarPeca(md: string, ctx: ContextoValidacao): ResultadoValidacao {
  const itens: ItemValidacao[] = [];
  const texto = md;
  const add = (id: string, rotulo: string, situacao: Situacao, detalhe: string | null = null) => itens.push({ id, rotulo, situacao, detalhe });

  // 1. Endereçamento
  const end1 = /EXCELENT[IÍ]SSIM[OA]\(?A?\)?\s+SENHOR/i.test(texto) || /EXCELENT[IÍ]SSIMO/i.test(texto);
  const end2 = /EGR[EÉ]GIO\s+TRIBUNAL/i.test(texto) || /COLENDA\s+\d/i.test(texto);
  if (ctx.grau === "segundo") add("enderecamento", "Endereçamento ao tribunal/câmara", end2 ? "ok" : "falta", end2 ? null : "Peça de 2º grau sem 'EGRÉGIO TRIBUNAL' / 'COLENDA CÂMARA'");
  else add("enderecamento", "Endereçamento ao juízo", end1 ? "ok" : "falta", end1 ? null : "Sem 'EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A)…'");
  const mt = /ESTADO DE MATO GROSSO|TRIBUNAL DE JUSTIÇA DO ESTADO DE MATO GROSSO|MATO GROSSO/i.test(texto);
  add("mato_grosso", "Menção ao Estado de Mato Grosso no endereçamento", mt ? "ok" : "atencao", mt ? null : "O endereçamento do TJ-MT termina em 'ESTADO DE MATO GROSSO'");

  // 2. Número CNJ
  const cnjs = extrairTodosCnj(texto);
  const cnjValido = cnjs.find((c) => validarDigitosCnj(c)) ?? null;
  if (ctx.numeroCnjProcesso) {
    const esperado = ctx.numeroCnjProcesso.replace(/\D/g, "");
    if (!cnjValido) add("cnj", "Número do processo (CNJ)", "falta", "Processo vinculado, mas o número não aparece na peça");
    else if (cnjValido !== esperado) add("cnj", "Número do processo (CNJ)", "falta", `A peça cita ${cnjValido}, mas o processo é ${esperado}`);
    else add("cnj", "Número do processo (CNJ)", "ok");
  } else if (cnjs.length && !cnjValido) add("cnj", "Número do processo (CNJ)", "atencao", "Há número no formato CNJ com dígito verificador inválido");
  else add("cnj", "Número do processo (CNJ)", cnjs.length ? "ok" : (ctx.tipoPeca === "inicial" ? "nao_aplicavel" : "atencao"), cnjs.length || ctx.tipoPeca === "inicial" ? null : "Peça sem número de processo");
  if (cnjValido && !cnjValido.slice(13, 16).startsWith("811")) add("cnj_tjmt", "Código do tribunal 8.11 (TJ-MT)", "atencao", "O número citado não é do TJ-MT");

  // 3. Qualificação / OAB / e-mail
  add("qualificacao", "Qualificação das partes (CPF/CNPJ)", /CPF|CNPJ/i.test(texto) ? "ok" : "falta", /CPF|CNPJ/i.test(texto) ? null : "Nenhum CPF/CNPJ na qualificação");
  add("oab", "OAB/MT da advogada", /OAB\s*\/?\s*MT/i.test(texto) ? "ok" : "falta");
  add("email", "E-mail para intimações (PJe)", /@/.test(texto) ? "ok" : "atencao", /@/.test(texto) ? null : "Sem e-mail na qualificação ou no preâmbulo");

  // 4. Estrutura
  const temFatos = /DOS\s+FATOS|^#+\s*.*FATOS/im.test(texto) || /\bFATOS\b/.test(texto);
  const temDireito = /DO\s+DIREITO|FUNDAMENTOS?\s+JUR[IÍ]DICOS?/i.test(texto);
  const temPedidos = /DOS?\s+PEDIDOS?|REQUERIMENTOS?/i.test(texto);
  add("estrutura", "Seções de fatos, direito e pedidos", temFatos && temDireito && temPedidos ? "ok" : "atencao", temFatos && temDireito && temPedidos ? null : `Faltando: ${[!temFatos && "fatos", !temDireito && "direito", !temPedidos && "pedidos"].filter(Boolean).join(", ")}`);
  const pedidosNumerados = (texto.match(/^\s*(?:[a-z]\)|\d+[.)]|[ivx]+[.)])\s+(?:condenar|determinar|declarar|anular|conceder|julgar|reconhecer|deferir|suspender|reintegrar|fixar|homologar|decretar|citar|intimar|confirmar|receber|conhecer|dar|prover|reformar|cassar)/gim) ?? []).length;
  add("pedidos_infinitivo", "Pedidos numerados com verbo no infinitivo", pedidosNumerados >= 1 ? "ok" : "atencao", pedidosNumerados >= 1 ? `${pedidosNumerados} pedido(s)` : "Nenhum pedido numerado começando por verbo no infinitivo");
  add("honorarios_custas", "Honorários e custas pedidos", /honor[aá]rios/i.test(texto) && /custas/i.test(texto) ? "ok" : (ctx.tipoPeca === "mandado_seguranca" ? "nao_aplicavel" : "atencao"));
  add("provas", "Protesto pela produção de provas", /produ[cç][aã]o\s+de\s+(todos\s+os\s+)?(meios\s+de\s+)?provas?/i.test(texto) ? "ok" : (ctx.tipoPeca === "inicial" || ctx.tipoPeca === "contestacao" ? "atencao" : "nao_aplicavel"));
  const valorCausa = /valor\s+d[ae]\s+causa|d[áa]-se\s+[àa]\s+causa/i.test(texto);
  add("valor_causa", "Valor da causa", valorCausa ? "ok" : (ctx.tipoPeca === "inicial" ? "falta" : "nao_aplicavel"));
  const tutela = /tutela\s+(de\s+urg[eê]ncia|antecipada|provis[oó]ria)|liminar/i.test(texto);
  if (tutela) {
    const tres = /probabilidade\s+do\s+direito|fumus/i.test(texto) && /perigo\s+de\s+dano|periculum|risco\s+ao\s+resultado/i.test(texto) && /revers/i.test(texto);
    add("tutela_art300", "Tutela de urgência com os 3 elementos do art. 300", tres ? "ok" : "atencao", tres ? null : "Probabilidade do direito, perigo de dano e reversibilidade precisam estar explícitos");
  } else add("tutela_art300", "Tutela de urgência", "nao_aplicavel");
  add("encerramento", "Encerramento (pede deferimento, local e data)", /pede\s+deferimento/i.test(texto) ? "ok" : "atencao");

  // 5. Documentos citados
  const citados = [...new Set([...texto.matchAll(RE_DOC)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  const inexistentes = ctx.documentosExistentes ? citados.filter((n) => !ctx.documentosExistentes!.includes(n)) : [];
  if (ctx.documentosExistentes) add("docs", "Todo 'Doc. NN' citado existe nos anexos", inexistentes.length ? "falta" : "ok", inexistentes.length ? `Inexistentes: ${inexistentes.map((n) => `Doc. ${String(n).padStart(2, "0")}`).join(", ")}` : `${citados.length} documento(s) citado(s)`);
  else add("docs", "Documentos citados", citados.length ? "ok" : "atencao", citados.length ? `${citados.length} citado(s); anexos não conferidos` : "Nenhum 'Doc. NN' citado");

  // 6. Lacunas
  const lacunas = listarLacunas(texto);
  add("lacunas", "Lacunas [[VERIFICAR]]", lacunas.length ? "falta" : "ok", lacunas.length ? `${lacunas.length}: ${lacunas.slice(0, 5).map((l) => l.motivo || "sem motivo").join("; ")}${lacunas.length > 5 ? "…" : ""}` : null);

  // 7. Citações de jurisprudência sem registro
  const citacoes = [...new Set([...texto.matchAll(RE_CITACAO)].map((m) => m[0].replace(/\s+/g, " ").trim()))];
  const semId = citacoes.filter((c) => !ctx.citacoesConfirmadas.some((id) => c.toLowerCase().includes(id.toLowerCase())));
  add("jurisprudencia", "Jurisprudência só com registro na base", semId.length ? "falta" : "ok", semId.length ? `Sem registro: ${semId.slice(0, 4).join("; ")}` : citacoes.length ? `${citacoes.length} citação(ões) confirmada(s)` : "Nenhuma citação numerada");

  // 8. Tempestividade e tamanho
  if (ctx.tempestivo === null) add("tempestividade", "Tempestividade", "nao_aplicavel");
  else add("tempestividade", "Tempestividade (motor de prazos)", ctx.tempestivo ? "ok" : "falta", ctx.tempestivo ? null : "Prazo vinculado já venceu ou a data não bate");
  const laudas = Math.max(1, Math.round(texto.replace(/\s+/g, " ").length / 2800));
  add("tamanho", "Tamanho (até 15 laudas)", laudas > 15 ? "atencao" : "ok", `~${laudas} lauda(s)`);
  add("juros", "Índices de correção/juros deixados para o cálculo", /INPC|IPCA|SELIC|1%\s*ao\s*m[eê]s|juros\s+de\s+mora\s+de\s+\d/i.test(texto) ? "atencao" : "ok", /INPC|IPCA|SELIC|1%\s*ao\s*m[eê]s/i.test(texto) ? "A peça fixa índice ou taxa; confira com o módulo de cálculos" : null);

  const pronta = itens.every((i) => i.situacao !== "falta");
  return { itens, lacunas: lacunas.length, docs_citados: citados, docs_inexistentes: inexistentes, citacoes_sem_id: semId, cnj_encontrado: cnjValido, laudas_estimadas: laudas, pronta };
}
