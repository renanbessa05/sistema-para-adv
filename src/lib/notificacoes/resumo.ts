/**
 * Texto do "resumo do dia" para WhatsApp e e-mail.
 *
 * O chamador passa só contadores e identificação por número de processo (com
 * máscara) e nome do ato; nunca texto de intimação, muito menos de processo
 * sigiloso. Datas chegam em YYYY-MM-DD e saem em DD/MM.
 */

export interface ItemPrazo {
  processoMascara: string;
  ato: string;
  /** YYYY-MM-DD. */
  dataFinal: string;
  /** YYYY-MM-DD; data interna da tarefa, quando houver. */
  dataInterna?: string;
}

export interface ItemTarefa {
  titulo: string;
  processoMascara?: string;
  /** YYYY-MM-DD; data interna que já passou. */
  dataInterna: string;
}

export interface DadosResumo {
  nome: string;
  publicacoesNovas: number;
  prazosHoje: ItemPrazo[];
  prazosAmanha: ItemPrazo[];
  /** Lista completa ou só o total. */
  prazosSemana: ItemPrazo[] | number;
  tarefasAtrasadas: ItemTarefa[];
  linkPainel: string;
  /** Rótulo da data, ex.: "quarta-feira, 28/10"; opcional. */
  dataLocal?: string;
  /** Máximo de itens listados por bloco no WhatsApp; padrão 5. */
  limiteItens?: number;
}

export interface ResumoDoDia {
  whatsapp: string;
  emailAssunto: string;
  emailHtml: string;
  totais: { publicacoesNovas: number; prazosHoje: number; prazosAmanha: number; prazosSemana: number; tarefasAtrasadas: number };
}

function diaMes(dataISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO);
  return m ? `${m[3]}/${m[2]}` : dataISO;
}

function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linhaPrazo(p: ItemPrazo): string {
  const interna = p.dataInterna ? ` (interna ${diaMes(p.dataInterna)})` : "";
  return `${p.ato} - ${p.processoMascara} - ${diaMes(p.dataFinal)}${interna}`;
}

function linhaTarefa(t: ItemTarefa): string {
  const processo = t.processoMascara ? ` - ${t.processoMascara}` : "";
  return `${t.titulo}${processo} - venceu ${diaMes(t.dataInterna)}`;
}

function listar<T>(itens: T[], limite: number, formatar: (item: T) => string, prefixo: string): string[] {
  const linhas = itens.slice(0, limite).map((item) => `${prefixo}${formatar(item)}`);
  if (itens.length > limite) linhas.push(`${prefixo}... e ${itens.length - limite} mais`);
  return linhas;
}

export function montarResumoDoDia(d: DadosResumo): ResumoDoDia {
  const limite = d.limiteItens ?? 5;
  const totalSemana = Array.isArray(d.prazosSemana) ? d.prazosSemana.length : d.prazosSemana;
  const totais = {
    publicacoesNovas: d.publicacoesNovas,
    prazosHoje: d.prazosHoje.length,
    prazosAmanha: d.prazosAmanha.length,
    prazosSemana: totalSemana,
    tarefasAtrasadas: d.tarefasAtrasadas.length,
  };
  const tudoZerado = Object.values(totais).every((n) => n === 0);
  const titulo = d.dataLocal ? `Resumo de ${d.dataLocal}` : "Resumo do dia";

  // WhatsApp: linhas curtas, poucos emojis, sem markdown
  const w: string[] = [`Bom dia, ${d.nome}! ${titulo}`, ""];
  if (tudoZerado) {
    w.push("✅ Nada pendente: sem publicações novas, prazos ou tarefas atrasadas.");
  } else {
    w.push(`📄 ${plural(totais.publicacoesNovas, "publicação nova", "publicações novas")}`);
    w.push(`⏰ ${plural(totais.prazosHoje, "prazo hoje", "prazos hoje")}`);
    w.push(...listar(d.prazosHoje, limite, linhaPrazo, "  • "));
    w.push(`📅 ${plural(totais.prazosAmanha, "prazo amanhã", "prazos amanhã")}`);
    w.push(...listar(d.prazosAmanha, limite, linhaPrazo, "  • "));
    w.push(`🗓 ${plural(totalSemana, "prazo na semana", "prazos na semana")}`);
    w.push(`📌 ${plural(totais.tarefasAtrasadas, "tarefa atrasada", "tarefas atrasadas")}`);
    w.push(...listar(d.tarefasAtrasadas, limite, linhaTarefa, "  • "));
  }
  w.push("", `Painel: ${d.linkPainel}`, "Responda aqui para consultar prazos, publicações e tarefas.");
  const whatsapp = w.join("\n");

  // E-mail: HTML simples, tudo escapado
  const bloco = (cabecalho: string, linhas: string[]): string => {
    const lista = linhas.length > 0 ? `<ul>${linhas.map((l) => `<li>${escaparHtml(l)}</li>`).join("")}</ul>` : "";
    return `<h3>${escaparHtml(cabecalho)}</h3>${lista}`;
  };
  const semanaLinhas = Array.isArray(d.prazosSemana) ? d.prazosSemana.map(linhaPrazo) : [];
  const emailHtml = [
    `<p>Bom dia, ${escaparHtml(d.nome)}!</p>`,
    `<h2>${escaparHtml(titulo)}</h2>`,
    tudoZerado
      ? "<p>Nada pendente: sem publicações novas, prazos ou tarefas atrasadas.</p>"
      : [
          `<p>${escaparHtml(plural(totais.publicacoesNovas, "publicação nova", "publicações novas"))}.</p>`,
          bloco(plural(totais.prazosHoje, "prazo hoje", "prazos hoje"), d.prazosHoje.map(linhaPrazo)),
          bloco(plural(totais.prazosAmanha, "prazo amanhã", "prazos amanhã"), d.prazosAmanha.map(linhaPrazo)),
          bloco(plural(totalSemana, "prazo na semana", "prazos na semana"), semanaLinhas),
          bloco(plural(totais.tarefasAtrasadas, "tarefa atrasada", "tarefas atrasadas"), d.tarefasAtrasadas.map(linhaTarefa)),
        ].join(""),
    `<p><a href="${escaparHtml(d.linkPainel)}">Abrir o painel</a></p>`,
  ].join("");

  return {
    whatsapp,
    emailAssunto: `${titulo}: ${plural(totais.prazosHoje, "prazo hoje", "prazos hoje")}, ${plural(totais.publicacoesNovas, "publicação nova", "publicações novas")}`,
    emailHtml,
    totais,
  };
}
