/**
 * Menu do painel: oito itens, na ordem do dia de trabalho. Tudo o mais (assistente, aprovações, audiências,
 * contratos, atendimento, revisor, varredura, cálculos, jurisprudência, relatórios e administração) continua
 * existindo nas rotas antigas, mas é alcançado de dentro das telas-mãe: cabeçalho, Processo, Cliente, Peças,
 * Prazos e Configurações. Quem vê cada item segue as mesmas regras de papel de antes: nada novo fica visível
 * para papel que não via.
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
  const grupos: GrupoMenu[] = [
    {
      titulo: "Dia a dia",
      itens: [
        { href: "/hoje", rotulo: "Hoje" },
        { href: "/publicacoes", rotulo: "Publicações" },
        { href: "/prazos", rotulo: "Prazos" },
        { href: "/tarefas", rotulo: "Tarefas" },
      ],
    },
    {
      titulo: "Carteira",
      itens: [
        { href: "/processos", rotulo: "Processos" },
        { href: "/clientes", rotulo: "Clientes" },
        { href: "/minutas", rotulo: "Peças" },
      ],
    },
    {
      titulo: "Escritório",
      itens: [{ href: "/configuracoes", rotulo: "Configurações" }],
    },
  ];

  if (papel === "suporte") grupos.push({ titulo: "Suporte", itens: [{ href: "/admin/suporte", rotulo: "Suporte" }] });
  return grupos;
}
