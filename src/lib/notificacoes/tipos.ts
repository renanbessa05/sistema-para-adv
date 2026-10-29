/**
 * Tipos do módulo de notificações (Parte 1 do escopo: tabela evento →
 * destinatário → canal → horário → template).
 */

export type EventoNotificacao =
  | "nova_publicacao"
  | "publicacao_sem_processo"
  | "publicacao_sem_tratamento_24h"
  | "publicacao_sem_tratamento_48h"
  | "prazo_d3"
  | "prazo_d1"
  | "prazo_d0"
  | "prazo_vencido"
  | "tarefa_atrasada"
  | "tarefa_reatribuida"
  | "resumo_do_dia"
  | "captacao_falhou"
  | "calendario_incompleto"
  | "convite"
  | "parcela_vencida"
  | "audiencia_d1"
  | "ia_teto_proximo"
  | "cliente_pediu_contato";

export type Canal = "painel" | "whatsapp" | "email";

export type Papel = "socio" | "advogado" | "estagiario" | "administrativo";

export interface Membro {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  /** Telefone com opt-in confirmado (termo + primeira mensagem enviada pela pessoa). */
  telefoneVerificado: boolean;
  emailVerificado: boolean;
}

export interface Ausencia {
  usuarioId: string;
  /** YYYY-MM-DD, inclusive. */
  inicio: string;
  /** YYYY-MM-DD, inclusive. */
  fim: string;
  /** Quem recebe as notificações no lugar do ausente. */
  substitutoId?: string;
}

/** Referência ao objeto que originou o evento (publicação, prazo, tarefa...). */
export interface ObjetoNotificacao {
  tipo: string;
  id: string;
}

export interface NotificacaoPlanejada {
  evento: EventoNotificacao;
  destinatarioId: string;
  canal: Canal;
  /** Nome do template da Meta; só para o canal whatsapp. */
  template?: string;
  variaveis: Record<string, string>;
  /** Instante do envio, ISO 8601 (UTC). */
  agendadaPara: string;
  /** `${evento}:${objeto.tipo}:${objeto.id}:${destinatarioId}:${canal}:${diaLocal}`. */
  chaveDedup: string;
  /** Preenchido quando a notificação foi redirecionada por ausência do destinatário original. */
  motivo?: "ausencia" | "ausencia_sem_substituto" | "inativo";
  /** Id do destinatário original, quando redirecionada. */
  substituiA?: string;
}
