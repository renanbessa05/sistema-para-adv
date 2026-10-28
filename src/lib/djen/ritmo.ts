/**
 * Limitador de ritmo por janela deslizante (N requisições por minuto).
 *
 * Usado pelos clientes do DJEN e do DataJud. Recebe `sleep` e `agora`
 * injetáveis para que os testes rodem sem esperar de verdade.
 */

export type Sleep = (ms: number) => Promise<void>;

export const sleepPadrao: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface OpcoesLimitador {
  /** Máximo de requisições dentro de uma janela de 60 segundos. */
  maxPorMinuto: number;
  sleep?: Sleep;
  /** Relógio em milissegundos (padrão `Date.now`). Injetável para testes. */
  agora?: () => number;
}

export interface Limitador {
  /** Bloqueia (via `sleep`) até que haja vaga na janela e então registra a requisição. */
  aguardarVaga(): Promise<void>;
  /** Quantidade de requisições registradas na janela atual. */
  emUso(): number;
}

const JANELA_MS = 60_000;

export function criarLimitador(opcoes: OpcoesLimitador): Limitador {
  const sleep = opcoes.sleep ?? sleepPadrao;
  const agora = opcoes.agora ?? (() => Date.now());
  const max = Math.max(1, Math.floor(opcoes.maxPorMinuto));
  let carimbos: number[] = [];

  function limpar(): void {
    const limite = agora() - JANELA_MS;
    carimbos = carimbos.filter((t) => t > limite);
  }

  return {
    async aguardarVaga() {
      limpar();
      while (carimbos.length >= max) {
        const maisAntigo = carimbos[0];
        const espera = Math.max(1, maisAntigo + JANELA_MS - agora());
        await sleep(espera);
        limpar();
      }
      carimbos.push(agora());
    },
    emUso() {
      limpar();
      return carimbos.length;
    },
  };
}
