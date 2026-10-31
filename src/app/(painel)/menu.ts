/**
 * Menu do painel, agrupado por área de trabalho. Quem vê cada item segue as mesmas regras de papel que o menu
 * anterior: nada novo fica visível para papel que não via antes.
 */
export interface ItemMenu {
  href: string;
  rotulo: string;
}

export interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}

type Papel = "socio" | "advogado" | "estagiario" | "administrativo" | "suporte";

export function gruposDoMenu(papel: Papel | string): GrupoMenu[] {
  const socio = papel === "socio";
  const advogado = papel === "advogado";
  const administrativo = papel === "administrativo";
  const gestao = socio || advogado || administrativo;

  const grupos: GrupoMenu[] = [
    {
      titulo: "Trabalho",
      itens: [
        { href: "/hoje", rotulo: "Hoje" },
        { href: "/assistente", rotulo: "Assistente" },
        { href: "/publicacoes", rotulo: "Publicações" },
        { href: "/prazos", rotulo: "Prazos" },
        { href: "/tarefas", rotulo: "Tarefas" },
        { href: "/audiencias", rotulo: "Audiências" },
        { href: "/aprovacoes", rotulo: "Aprovações" },
      ],
    },
    {
      titulo: "Clientes e processos",
      itens: [
        { href: "/processos", rotulo: "Processos" },
        { href: "/clientes", rotulo: "Clientes" },
        { href: "/atendimento", rotulo: "Atendimento" },
        { href: "/contratos", rotulo: "Contratos" },
      ],
    },
    {
      titulo: "Peças e IA",
      itens: [
        { href: "/minutas", rotulo: "Peças" },
        { href: "/revisor", rotulo: "Revisor" },
        { href: "/calculos", rotulo: "Cálculos" },
        { href: "/jurisprudencia", rotulo: "Jurisprudência" },
      ],
    },
  ];

  const administracao: ItemMenu[] = [];
  if (socio || advogado) administracao.push({ href: "/relatorios", rotulo: "Relatórios" });
  if (gestao) {
    administracao.push({ href: "/admin/status", rotulo: "Rotinas" });
    administracao.push({ href: "/admin/divergencias", rotulo: "Divergências" });
  }
  if (socio) {
    administracao.push({ href: "/admin/metricas", rotulo: "Métricas" });
    administracao.push({ href: "/admin/ia", rotulo: "Custo IA" });
    administracao.push({ href: "/configuracoes/plano", rotulo: "Plano" });
  }
  administracao.push({ href: "/configuracoes", rotulo: "Configurações" });
  grupos.push({ titulo: "Administração", itens: administracao });

  if (papel === "suporte") grupos.push({ titulo: "Suporte", itens: [{ href: "/admin/suporte", rotulo: "Suporte" }] });
  return grupos;
}
