/**
 * Regras puras do mapa do julgador (lote 9). Nada aqui chama IA ou banco: o aviso de previsão judicial e a montagem do
 * relatório são determinísticos, para que a IA nunca decida se o aviso aparece.
 */

export const AVISO_PREVISAO =
  "**Aviso:** minuta de previsão judicial para estudo do caso. Não é decisão oficial e não substitui o pronunciamento do magistrado natural do processo. As citações e valores devem ser conferidos antes de qualquer uso.";

/** Fases do pronunciamento cabível (Passo 2 da skill). `sem_pronunciamento` vale quando o processo aguarda ato da parte. */
export const FASES_PRONUNCIAMENTO = ["decisao_interlocutoria", "saneamento", "sentenca", "acordao", "sem_pronunciamento"] as const;
export type FasePronunciamento = (typeof FASES_PRONUNCIAMENTO)[number];

export const ROTULO_FASE: Record<FasePronunciamento, string> = {
  decisao_interlocutoria: "Decisão interlocutória",
  saneamento: "Decisão de saneamento (art. 357 do CPC)",
  sentenca: "Sentença (art. 355, I, do CPC)",
  acordao: "Acórdão",
  sem_pronunciamento: "Sem pronunciamento a proferir (aguarda ato da parte)",
};

/** Marca de presença do aviso, tolerante a caixa, espaços e à forma com ou sem negrito. */
function temAviso(texto: string): boolean {
  const normal = texto.toLowerCase().replace(/\*\*/g, "").replace(/\s+/g, " ");
  return normal.includes("minuta de previsão judicial para estudo do caso") && normal.includes("não é decisão oficial");
}

/**
 * Garante o aviso obrigatório ao final da minuta. Se a IA já o incluiu, não duplica; se não, acrescenta o texto fixo.
 * Minuta vazia continua vazia: o chamador trata isso como falha, não como minuta válida.
 */
export function garantirAviso(minuta: string): string {
  const limpa = minuta.trimEnd();
  if (limpa.length === 0) return "";
  if (temAviso(limpa)) return limpa;
  return `${limpa}\n\n> ${AVISO_PREVISAO}`;
}

export interface SecoesJulgador {
  mapaMd: string;
  minutaMd: string;
  fase: FasePronunciamento;
}

/** Relatório salvo em `analises.conteudo_md`: mapa (Parte I), minuta (Parte II) com aviso, sempre na mesma ordem. */
export function montarRelatorioJulgador(s: SecoesJulgador): string {
  const mapa = s.mapaMd.trim();
  const minuta = garantirAviso(s.minutaMd);
  const cabecalho = `**Pronunciamento cabível nesta fase:** ${ROTULO_FASE[s.fase]}.`;
  if (minuta.length === 0) return `${cabecalho}\n\n## PARTE I — Mapa estratégico\n\n${mapa}\n\n## PARTE II — Minuta\n\nSem minuta: a fase atual não comporta pronunciamento.`;
  return `${cabecalho}\n\n## PARTE I — Mapa estratégico\n\n${mapa}\n\n## PARTE II — Minuta do pronunciamento\n\n${minuta}`;
}

export function faseValida(valor: unknown): valor is FasePronunciamento {
  return typeof valor === "string" && (FASES_PRONUNCIAMENTO as readonly string[]).includes(valor);
}
