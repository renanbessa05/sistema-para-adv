import Link from "next/link";
import type { Papel } from "@/server/sessao";
import { cn } from "@/lib/utils";

export type GrupoArea = "Escritório" | "Prazos e processos" | "Comunicação" | "Operação" | "Conformidade";

export const AREAS: { href: string; rotulo: string; descricao: string; papeis: Papel[]; grupo: GrupoArea }[] = [
  // Escritório
  { href: "/configuracoes/escritorio", rotulo: "Escritório", descricao: "Nome, CNPJ, fuso, horário do resumo, dias de segurança.", papeis: ["socio"], grupo: "Escritório" },
  { href: "/configuracoes/equipe", rotulo: "Equipe", descricao: "Membros, convites, OAB e telefones do WhatsApp.", papeis: ["socio", "advogado", "estagiario", "administrativo"], grupo: "Escritório" },
  { href: "/configuracoes/documentos", rotulo: "Documentos", descricao: "Timbre dos documentos gerados: endereço, contatos e advogada responsável.", papeis: ["socio"], grupo: "Escritório" },
  { href: "/configuracoes/honorarios", rotulo: "Honorários", descricao: "Tabela OAB/MT vigente (URH) e fatores de complexidade.", papeis: ["socio"], grupo: "Escritório" },
  { href: "/configuracoes/modelos", rotulo: "Modelos de peça", descricao: "Modelos .docx do escritório por tipo de peça e área, usados como referência de estrutura.", papeis: ["socio", "advogado"], grupo: "Escritório" },
  { href: "/configuracoes/plano", rotulo: "Plano", descricao: "Plano contratado, limites e acesso do suporte.", papeis: ["socio"], grupo: "Escritório" },
  // Prazos e processos
  { href: "/configuracoes/atos", rotulo: "Atos e prazos", descricao: "Atos processuais com prazo padrão e dias de segurança.", papeis: ["socio"], grupo: "Prazos e processos" },
  { href: "/configuracoes/fases", rotulo: "Fases do kanban", descricao: "Colunas do quadro de processos e códigos TPU.", papeis: ["socio"], grupo: "Prazos e processos" },
  { href: "/configuracoes/calendario", rotulo: "Calendário forense", descricao: "Feriados e suspensões do TJ-MT por ano e comarca.", papeis: ["socio", "administrativo"], grupo: "Prazos e processos" },
  { href: "/configuracoes/tribunais", rotulo: "Outros tribunais", descricao: "Camada local confirmada para processos fora de Mato Grosso.", papeis: ["socio", "advogado"], grupo: "Prazos e processos" },
  { href: "/configuracoes/ausencias", rotulo: "Ausências", descricao: "Férias e licenças, com substituto para as notificações.", papeis: ["socio", "advogado", "estagiario", "administrativo"], grupo: "Prazos e processos" },
  // Comunicação
  { href: "/configuracoes/notificacoes", rotulo: "Notificações", descricao: "Canais ativos por evento (painel, WhatsApp, e-mail).", papeis: ["socio"], grupo: "Comunicação" },
  { href: "/configuracoes/atendimento", rotulo: "Atendimento", descricao: "Envio ao cliente por WhatsApp (desligado por padrão), horário e textos.", papeis: ["socio"], grupo: "Comunicação" },
  { href: "/configuracoes/integracoes", rotulo: "Integrações", descricao: "Segredos do WhatsApp e do DataJud guardados no Vault.", papeis: ["socio"], grupo: "Comunicação" },
  // Operação (as rotas /admin/* e /relatorios continuam existindo; aqui é só o lugar de chegar nelas)
  { href: "/admin/status", rotulo: "Rotinas", descricao: "Execuções das rotinas automáticas, captações e backups.", papeis: ["socio", "advogado", "administrativo"], grupo: "Operação" },
  { href: "/admin/divergencias", rotulo: "Divergências", descricao: "Registro semanal da operação paralela sistema × PJe.", papeis: ["socio", "advogado", "administrativo"], grupo: "Operação" },
  { href: "/configuracoes/relatorios", rotulo: "Relatórios", descricao: "Produtividade por pessoa, métricas de 30 dias, custo de IA e CSV mensal, em abas.", papeis: ["socio", "advogado"], grupo: "Operação" },
  // Conformidade
  { href: "/configuracoes/lgpd", rotulo: "LGPD", descricao: "Pedidos dos titulares, exportação, anonimização e retenção de dados.", papeis: ["socio"], grupo: "Conformidade" },
  { href: "/configuracoes/seguranca", rotulo: "Segurança", descricao: "Segundo fator (aplicativo autenticador), obrigatório para sócio e advogado.", papeis: ["socio", "advogado", "estagiario", "administrativo"], grupo: "Conformidade" },
];

export const GRUPOS_AREA: GrupoArea[] = ["Escritório", "Prazos e processos", "Comunicação", "Operação", "Conformidade"];

export function areasPara(papel: Papel) {
  return AREAS.filter((a) => a.papeis.includes(papel));
}

const PILULA = "shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors";
const PILULA_ATIVA = "bg-marca-600 text-white shadow-marca";
const PILULA_INATIVA = "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900";

/** Barra das Configurações: a visão geral e as áreas do mesmo grupo da área atual (todas, na visão geral). */
export function NavegacaoConfiguracoes({ papel, atual }: { papel: Papel; atual: string }) {
  const grupoAtual = AREAS.find((a) => a.href === atual)?.grupo ?? null;
  const areas = areasPara(papel).filter((a) => grupoAtual === null || a.grupo === grupoAtual);
  return (
    <nav className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 whitespace-nowrap [scrollbar-width:none] md:mx-0 md:px-0" aria-label="Configurações">
      <Link href="/configuracoes" aria-current={atual === "/configuracoes" ? "page" : undefined} className={cn(PILULA, atual === "/configuracoes" ? PILULA_ATIVA : PILULA_INATIVA)}>
        Visão geral
      </Link>
      {grupoAtual ? (
        <span className="flex shrink-0 items-center gap-1.5 pl-1 text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase" aria-hidden>
          <span className="h-4 w-px bg-zinc-200" />
          {grupoAtual}
        </span>
      ) : null}
      {areas.map((a) => (
        <Link key={a.href} href={a.href} aria-current={atual === a.href ? "page" : undefined} className={cn(PILULA, atual === a.href ? PILULA_ATIVA : PILULA_INATIVA)}>
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
