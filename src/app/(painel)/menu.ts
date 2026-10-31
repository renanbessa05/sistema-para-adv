/**
 * Menu do painel: oito itens, na ordem do dia de trabalho. Tudo o mais (assistente, aprovações, audiências,
 * contratos, atendimento, revisor, varredura, cálculos, jurisprudência, relatórios e administração) continua
 * existindo nas rotas antigas, mas é alcançado de dentro das telas-mãe: cabeçalho, Processo, Cliente, Peças,
 * Prazos e Configurações. Quem vê cada item segue as mesmas regras de papel de antes: nada novo fica visível
 * para papel que não via.
 */
export type IconeMenu = "hoje" | "publicacoes" | "prazos" | "tarefas" | "processos" | "clientes" | "pecas" | "configuracoes" | "suporte";

export interface ItemMenu {
  href: string;
  rotulo: string;
  /** Ícone desenhado pelo componente de menu (chave, não componente, para o arquivo seguir puro). */
  icone: IconeMenu;
  /** Chave do contador mostrado ao lado do rótulo (ex.: publicações a tratar). */
  contador?: "publicacoes" | "prazos";
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
        { href: "/hoje", rotulo: "Hoje", icone: "hoje" },
        { href: "/publicacoes", rotulo: "Publicações", icone: "publicacoes", contador: "publicacoes" },
        { href: "/prazos", rotulo: "Prazos", icone: "prazos", contador: "prazos" },
        { href: "/tarefas", rotulo: "Tarefas", icone: "tarefas" },
      ],
    },
    {
      titulo: "Carteira",
      itens: [
        { href: "/processos", rotulo: "Processos", icone: "processos" },
        { href: "/clientes", rotulo: "Clientes", icone: "clientes" },
        { href: "/minutas", rotulo: "Peças", icone: "pecas" },
      ],
    },
    {
      titulo: "Escritório",
      itens: [{ href: "/configuracoes", rotulo: "Configurações", icone: "configuracoes" }],
    },
  ];

  if (papel === "suporte") grupos.push({ titulo: "Suporte", itens: [{ href: "/admin/suporte", rotulo: "Suporte", icone: "suporte" }] });
  return grupos;
}

/** Itens fixos da barra inferior do celular: os quatro mais usados; o resto fica em "Mais". */
export const HREFS_BARRA_INFERIOR = ["/hoje", "/publicacoes", "/prazos", "/processos"];
