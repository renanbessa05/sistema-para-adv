import Link from "next/link";
import type { Papel } from "@/server/sessao";

export const AREAS: { href: string; rotulo: string; descricao: string; papeis: Papel[] }[] = [
  { href: "/configuracoes/escritorio", rotulo: "Escritório", descricao: "Nome, CNPJ, fuso, horário do resumo, dias de segurança.", papeis: ["socio"] },
  { href: "/configuracoes/equipe", rotulo: "Equipe", descricao: "Membros, convites, OAB e telefones do WhatsApp.", papeis: ["socio", "advogado", "estagiario", "administrativo"] },
  { href: "/configuracoes/atos", rotulo: "Atos e prazos", descricao: "Atos processuais com prazo padrão e dias de segurança.", papeis: ["socio"] },
  { href: "/configuracoes/fases", rotulo: "Fases do kanban", descricao: "Colunas do quadro de processos e códigos TPU.", papeis: ["socio"] },
  { href: "/configuracoes/calendario", rotulo: "Calendário forense", descricao: "Feriados e suspensões do TJ-MT por ano e comarca.", papeis: ["socio", "administrativo"] },
  { href: "/configuracoes/ausencias", rotulo: "Ausências", descricao: "Férias e licenças, com substituto para as notificações.", papeis: ["socio", "advogado", "estagiario", "administrativo"] },
  { href: "/configuracoes/notificacoes", rotulo: "Notificações", descricao: "Canais ativos por evento (painel, WhatsApp, e-mail).", papeis: ["socio"] },
  { href: "/configuracoes/relatorios", rotulo: "Relatórios", descricao: "CSV mensal de produtividade por pessoa, gerado no dia 1.", papeis: ["socio"] },
  { href: "/configuracoes/honorarios", rotulo: "Honorários", descricao: "Tabela OAB/MT vigente (URH) e fatores de complexidade.", papeis: ["socio"] },
  { href: "/configuracoes/modelos", rotulo: "Modelos de peça", descricao: "Modelos .docx do escritório por tipo de peça e área, usados como referência de estrutura.", papeis: ["socio", "advogado"] },
  { href: "/configuracoes/documentos", rotulo: "Documentos", descricao: "Timbre dos documentos gerados: endereço, contatos e advogada responsável.", papeis: ["socio"] },
  { href: "/configuracoes/integracoes", rotulo: "Integrações", descricao: "Segredos do WhatsApp e do DataJud guardados no Vault.", papeis: ["socio"] },
  { href: "/configuracoes/seguranca", rotulo: "Segurança", descricao: "Segundo fator (aplicativo autenticador), obrigatório para sócio e advogado.", papeis: ["socio", "advogado", "estagiario", "administrativo"] },
];

export function areasPara(papel: Papel) {
  return AREAS.filter((a) => a.papeis.includes(papel));
}

export function NavegacaoConfiguracoes({ papel, atual }: { papel: Papel; atual: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2 text-sm dark:border-zinc-800" aria-label="Configurações">
      <Link href="/configuracoes" className={`rounded-md px-2 py-1 ${atual === "/configuracoes" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
        Visão geral
      </Link>
      {areasPara(papel).map((a) => (
        <Link key={a.href} href={a.href} className={`rounded-md px-2 py-1 ${atual === a.href ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
