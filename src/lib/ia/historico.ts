import type Anthropic from "@anthropic-ai/sdk";
import type { MensagemIa } from "./cliente";

type Bloco = Anthropic.Beta.Messages.BetaContentBlockParam;

/**
 * Histórico de uma conversa do painel, reconstruído das linhas de `mensagens` (puro).
 * - entrada: pessoa (texto);
 * - saida: assistente (payload com os blocos de conteúdo inteiros, append-only) ou texto puro;
 * - ferramenta: resultado(s) de ferramenta (payload = conteúdo da mensagem user com tool_result);
 * - sistema: avisos do sistema (não vão ao modelo);
 * - resumo: resumo de conversa anterior (vai como texto da pessoa, delimitado pelo chamador).
 */
export interface LinhaMensagem {
  direcao: "entrada" | "saida";
  tipo: string;
  texto: string | null;
  payload: unknown;
}

export const LIMITE_TURNOS = 30;

export function montarHistorico(linhas: LinhaMensagem[]): MensagemIa[] {
  const historico: MensagemIa[] = [];
  for (const l of linhas) {
    if (l.tipo === "sistema") continue;
    if (l.tipo === "ferramenta") {
      // Linhas 'ferramenta' guardam ou a mensagem do assistente que chamou ferramentas (blocos text/tool_use)
      // ou a mensagem com os resultados (blocos tool_result). O papel vem do tipo dos blocos.
      const blocos = l.payload as Bloco[] | null;
      if (!Array.isArray(blocos) || blocos.length === 0) continue;
      const ehResultado = blocos.some((b) => b.type === "tool_result");
      historico.push(ehResultado ? { role: "user", content: blocos } : { role: "assistant", content: blocos });
      continue;
    }
    if (l.direcao === "entrada") {
      const texto = l.tipo === "resumo" ? `<dado rotulo="resumo_conversa_anterior">\n${l.texto ?? ""}\n</dado>` : (l.texto ?? "");
      if (texto.trim()) historico.push({ role: "user", content: texto });
      continue;
    }
    const blocos = l.payload as MensagemIa["content"] | null;
    if (blocos && Array.isArray(blocos) && blocos.length > 0) historico.push({ role: "assistant", content: blocos });
    else if (l.texto) historico.push({ role: "assistant", content: l.texto });
  }
  return normalizarAlternancia(historico);
}

/**
 * A API exige alternância user/assistant e começo por user. Junta mensagens seguidas do mesmo papel
 * (por exemplo, resultado de ferramenta seguido de nova pergunta) e descarta assistente inicial órfão.
 */
export function normalizarAlternancia(mensagens: MensagemIa[]): MensagemIa[] {
  const saida: MensagemIa[] = [];
  for (const m of mensagens) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (saida.length === 0 && m.role !== "user") continue;
    const ultima = saida[saida.length - 1];
    if (ultima && ultima.role === m.role) {
      const juntas: Bloco[] = [...paraBlocos(ultima.content), ...paraBlocos(m.content)];
      saida[saida.length - 1] = m.role === "user" ? { role: "user", content: juntas } : { role: "assistant", content: juntas };
    } else {
      saida.push(m);
    }
  }
  // Não pode terminar em assistente antes de uma nova pergunta: o chamador acrescenta a pergunta depois.
  return saida;
}

function paraBlocos(c: MensagemIa["content"]): Bloco[] {
  if (typeof c === "string") return [{ type: "text", text: c }];
  return c as Bloco[];
}

/** Conta turnos (pares pessoa/assistente) para decidir quando pedir "nova conversa com resumo". */
export function contarTurnos(linhas: LinhaMensagem[]): number {
  return linhas.filter((l) => l.direcao === "entrada" && (l.tipo === "text" || l.tipo === "texto")).length;
}

export function precisaResumo(turnos: number, limite = LIMITE_TURNOS): boolean {
  return turnos >= limite;
}
