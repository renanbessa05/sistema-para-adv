import { resolverDestinatario } from "./destinatarios";
import { adicionarDias, ehDiaUtil, instanteLocal, partesLocais, proximoDiaUtil, TZ_PADRAO } from "./horas-uteis";
import type {
  Ausencia,
  Canal,
  EventoNotificacao,
  Membro,
  NotificacaoPlanejada,
  ObjetoNotificacao,
} from "./tipos";

/**
 * Tabela declarativa de notificação (escopo 1.3.1, "Regras de notificação").
 *
 * - `destinatarios`: quem recebe, antes do redirecionamento por ausência.
 * - `canais`: painel entra sempre que listado; whatsapp exige telefone verificado;
 *   email exige e-mail verificado (exceto `convite`, que é justamente a verificação).
 * - `horarioLocal`: "imediato" ou "HH:MM" no fuso do escritório.
 * - `somenteDiasUteis`: horário fixo cai no próximo dia útil; "imediato" em dia
 *   não útil adia whatsapp/email para as 07:00 do próximo dia útil.
 * - `template`: nome do template da Meta usado no canal whatsapp.
 */

export type Destinatarios =
  | "responsavel"
  | "responsavel_e_socios"
  | "socios"
  | "socios_e_administrativo"
  | "todos_ativos"
  | "usuario_alvo";

export interface RegraNotificacao {
  destinatarios: Destinatarios;
  canais: Canal[];
  horarioLocal?: "imediato" | `${number}${number}:${number}${number}`;
  somenteDiasUteis: boolean;
  template?: string;
  /** O evento também entra como linha do resumo do dia. */
  incluirNoResumo?: boolean;
}

/** Janela em que o WhatsApp "imediato" pode ser enviado (hora local, [inicio, fim)). */
export const EXPEDIENTE_WHATSAPP = { inicio: 7, fim: 20 } as const;

/** Eventos que ignoram a janela do WhatsApp e saem sempre na hora. */
export const EVENTOS_SEMPRE_IMEDIATOS: ReadonlySet<EventoNotificacao> = new Set(["prazo_d0", "prazo_vencido", "captacao_falhou"]);

export const REGRAS: Record<EventoNotificacao, RegraNotificacao> = {
  nova_publicacao: {
    destinatarios: "responsavel",
    canais: ["painel", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
    template: "nova_publicacao",
  },
  publicacao_sem_processo: {
    // Publicação captada pela OAB de alguém da equipe sem processo correspondente na carteira: quem cadastra
    // processo (administrativo) e os sócios decidem se é caso novo, homônimo ou cadastro faltando.
    destinatarios: "socios_e_administrativo",
    canais: ["painel", "email"],
    horarioLocal: "imediato",
    somenteDiasUteis: true,
  },
  publicacao_sem_tratamento_24h: {
    destinatarios: "responsavel",
    canais: ["painel", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: true,
    template: "publicacao_sem_tratamento",
  },
  publicacao_sem_tratamento_48h: {
    destinatarios: "socios",
    canais: ["painel", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: true,
    template: "publicacao_sem_tratamento",
  },
  prazo_d3: {
    destinatarios: "responsavel",
    canais: ["painel", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: true,
    template: "alerta_prazo",
  },
  prazo_d1: {
    destinatarios: "responsavel",
    canais: ["painel", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: true,
    template: "alerta_prazo",
  },
  prazo_d0: {
    destinatarios: "responsavel_e_socios",
    canais: ["painel", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
    template: "alerta_prazo",
  },
  prazo_vencido: {
    // Emitido pelo job que marca vencidos (0h05 local): sai na hora, por todos os canais, sem esperar expediente.
    destinatarios: "responsavel_e_socios",
    canais: ["painel", "whatsapp", "email"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
    template: "alerta_prazo",
  },
  parcela_vencida: {
    // Parcela de honorários vencida (job cobranca-parcelas, 11h UTC em dias úteis): quem cobra é sócio e administrativo.
    destinatarios: "socios_e_administrativo",
    canais: ["painel", "email"],
    horarioLocal: "imediato",
    somenteDiasUteis: true,
    template: "alerta_prazo",
  },
  audiencia_d1: {
    // Véspera de audiência (job alertas-audiencia, 11h UTC em dias úteis): quem vai à audiência recebe no painel e no WhatsApp.
    destinatarios: "responsavel_e_socios",
    canais: ["painel", "whatsapp"],
    horarioLocal: "07:00",
    somenteDiasUteis: true,
    template: "alerta_prazo",
  },
  ia_teto_proximo: {
    // Gasto de IA do mês chegou ao percentual de alerta (job alertas-ia, 12h UTC, todo dia; uma vez por mês). Sócios, por painel e e-mail.
    destinatarios: "socios",
    canais: ["painel", "email"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
  },
  cliente_pediu_contato: {
    // Cliente pediu falar com a equipe pelo WhatsApp (lote 14): responsável do processo e sócios, no painel e por e-mail.
    destinatarios: "responsavel_e_socios",
    canais: ["painel", "email"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
  },
  tarefa_atrasada: {
    // Não gera WhatsApp próprio: aparece no painel e como linha do resumo do dia.
    destinatarios: "responsavel",
    canais: ["painel"],
    horarioLocal: "07:30",
    somenteDiasUteis: true,
    incluirNoResumo: true,
  },
  tarefa_reatribuida: {
    destinatarios: "usuario_alvo",
    canais: ["painel", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
    template: "tarefa_reatribuida",
  },
  resumo_do_dia: {
    destinatarios: "todos_ativos",
    canais: ["painel", "whatsapp", "email"],
    horarioLocal: "07:30",
    somenteDiasUteis: true,
    template: "resumo_do_dia",
  },
  captacao_falhou: {
    destinatarios: "socios",
    canais: ["painel", "email", "whatsapp"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
  },
  calendario_incompleto: {
    destinatarios: "socios_e_administrativo",
    canais: ["painel", "email"],
    horarioLocal: "imediato",
    somenteDiasUteis: true,
  },
  convite: {
    destinatarios: "usuario_alvo",
    canais: ["email"],
    horarioLocal: "imediato",
    somenteDiasUteis: false,
  },
};

export interface ParametrosPlanejamento {
  evento: EventoNotificacao;
  agora: Date;
  tz?: string;
  /** Datas YYYY-MM-DD sem expediente. */
  feriados: readonly string[];
  membros: readonly Membro[];
  responsavelId?: string;
  usuarioAlvoId?: string;
  ausencias: readonly Ausencia[];
  objeto: ObjetoNotificacao;
  variaveis: Record<string, string>;
}

function horarioFixo(valor: RegraNotificacao["horarioLocal"]): { hora: number; minuto: number } | null {
  if (!valor || valor === "imediato") return null;
  const [h, m] = valor.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Horário inválido na regra: ${valor}`);
  }
  return { hora: h, minuto: m };
}

/**
 * Próxima ocorrência de hora:minuto local a partir de `agora`: hoje se ainda não
 * passou (e hoje é útil quando exigido), senão o próximo dia (útil).
 */
export function agendarHorarioFixo(
  agora: Date,
  hora: number,
  minuto: number,
  { tz = TZ_PADRAO, feriados, somenteDiasUteis }: { tz?: string; feriados: readonly string[]; somenteDiasUteis: boolean },
): Date {
  const hoje = partesLocais(agora, tz).data;
  let dia = hoje;
  if (instanteLocal(dia, hora, minuto, tz).getTime() < agora.getTime()) dia = adicionarDias(dia, 1);
  if (somenteDiasUteis && !ehDiaUtil(dia, { feriados })) dia = proximoDiaUtil(dia, { feriados });
  return instanteLocal(dia, hora, minuto, tz);
}

/** WhatsApp "imediato" fora de 07h-20h local (ou em dia não útil, quando exigido) vai para as 07:00 do próximo dia útil. */
function agendarWhatsappImediato(
  agora: Date,
  { tz, feriados, somenteDiasUteis }: { tz: string; feriados: readonly string[]; somenteDiasUteis: boolean },
): Date {
  const p = partesLocais(agora, tz);
  const dentroDoHorario = p.hora >= EXPEDIENTE_WHATSAPP.inicio && p.hora < EXPEDIENTE_WHATSAPP.fim;
  const diaPermitido = !somenteDiasUteis || ehDiaUtil(p.data, { feriados });
  if (dentroDoHorario && diaPermitido) return agora;
  return agendarHorarioFixo(agora, EXPEDIENTE_WHATSAPP.inicio, 0, { tz, feriados, somenteDiasUteis: true });
}

function idsBase(regra: RegraNotificacao, p: ParametrosPlanejamento): string[] {
  const ativos = p.membros.filter((m) => m.ativo);
  const socios = ativos.filter((m) => m.papel === "socio").map((m) => m.id);
  switch (regra.destinatarios) {
    case "responsavel":
      // Sem responsável definido (processo sem dono), os sócios assumem.
      return p.responsavelId ? [p.responsavelId] : socios;
    case "responsavel_e_socios":
      return p.responsavelId ? [p.responsavelId, ...socios] : socios;
    case "socios":
      return socios;
    case "socios_e_administrativo":
      return ativos.filter((m) => m.papel === "socio" || m.papel === "administrativo").map((m) => m.id);
    case "todos_ativos":
      return ativos.map((m) => m.id);
    case "usuario_alvo":
      return p.usuarioAlvoId ? [p.usuarioAlvoId] : [];
  }
}

/** Canal permitido para o membro: painel sempre; whatsapp/email exigem verificação (convite dispensa). */
export function canalPermitido(canal: Canal, membro: Membro | undefined, evento: EventoNotificacao): boolean {
  if (canal === "painel") return membro !== undefined;
  if (canal === "whatsapp") return membro?.telefoneVerificado === true;
  if (evento === "convite") return true;
  return membro?.emailVerificado === true;
}

/**
 * Expande um evento na lista de notificações a enfileirar, já com destinatário
 * resolvido (ausência/substituto), canais filtrados, horário e chave de dedup.
 * A persistência e o envio ficam em src/server; aqui só se decide quem, por onde e quando.
 */
export function planejarNotificacoes(p: ParametrosPlanejamento): NotificacaoPlanejada[] {
  const regra = REGRAS[p.evento];
  const tz = p.tz ?? TZ_PADRAO;
  const feriados = p.feriados;
  const diaLocalAgora = partesLocais(p.agora, tz).data;
  const fixo = horarioFixo(regra.horarioLocal);

  // 1) destinatários base → resolvidos por ausência, sem duplicatas
  const resolvidos = new Map<string, { motivo?: NotificacaoPlanejada["motivo"]; substituiA?: string }>();
  for (const id of idsBase(regra, p)) {
    for (const r of resolverDestinatario(id, diaLocalAgora, p.ausencias, p.membros)) {
      if (resolvidos.has(r.usuarioId) && resolvidos.get(r.usuarioId)?.motivo === undefined) continue;
      resolvidos.set(
        r.usuarioId,
        r.motivo === "direto" ? {} : { motivo: r.motivo, substituiA: r.substituiA },
      );
    }
  }

  // 2) um item por destinatário × canal
  const planejadas: NotificacaoPlanejada[] = [];
  for (const [destinatarioId, info] of resolvidos) {
    const membro = p.membros.find((m) => m.id === destinatarioId);
    if (membro && !membro.ativo) continue;
    if (!membro && p.evento !== "convite") continue;

    for (const canal of regra.canais) {
      if (!canalPermitido(canal, membro, p.evento)) continue;

      let agendadaPara: Date;
      if (fixo) {
        agendadaPara = agendarHorarioFixo(p.agora, fixo.hora, fixo.minuto, {
          tz,
          feriados,
          somenteDiasUteis: regra.somenteDiasUteis,
        });
      } else if (canal === "painel" || EVENTOS_SEMPRE_IMEDIATOS.has(p.evento)) {
        agendadaPara = p.agora;
      } else if (canal === "whatsapp") {
        agendadaPara = agendarWhatsappImediato(p.agora, { tz, feriados, somenteDiasUteis: regra.somenteDiasUteis });
      } else if (regra.somenteDiasUteis && !ehDiaUtil(diaLocalAgora, { feriados })) {
        // e-mail "imediato" em dia não útil espera a abertura do próximo dia útil
        agendadaPara = agendarHorarioFixo(p.agora, EXPEDIENTE_WHATSAPP.inicio, 0, { tz, feriados, somenteDiasUteis: true });
      } else {
        agendadaPara = p.agora;
      }

      const diaLocal = partesLocais(agendadaPara, tz).data;
      const variaveis: Record<string, string> = { ...p.variaveis };
      if (info.substituiA) {
        const original = p.membros.find((m) => m.id === info.substituiA);
        variaveis.substitui_a = original?.nome ?? info.substituiA;
      }

      planejadas.push({
        evento: p.evento,
        destinatarioId,
        canal,
        ...(canal === "whatsapp" && regra.template ? { template: regra.template } : {}),
        variaveis,
        agendadaPara: agendadaPara.toISOString(),
        chaveDedup: `${p.evento}:${p.objeto.tipo}:${p.objeto.id}:${destinatarioId}:${canal}:${diaLocal}`,
        ...(info.motivo ? { motivo: info.motivo } : {}),
        ...(info.substituiA ? { substituiA: info.substituiA } : {}),
      });
    }
  }

  return planejadas;
}
