import { formatarCpf } from "../timbre";
import { ouLacuna } from "../marcadores";
import type { DadosDeclaracao } from "./dados";
import { qualificacaoCliente } from "./qualificacao";

/**
 * Declaração de hipossuficiência (assets/declaracao-hipossuficiencia.md). Regras que não mudam: não menciona
 * honorários advocatícios; não traz contato nenhum; pessoa jurídica não usa este modelo (Súmula 481/STJ).
 */
export function declaracaoHipossuficienciaMarkdown(d: DadosDeclaracao): string {
  if (d.cliente.tipoPessoa === "juridica") {
    throw new Error("Pessoa jurídica não usa declaração de hipossuficiência: precisa comprovar a insuficiência (Súmula 481/STJ).");
  }
  return [
    "# DECLARAÇÃO DE HIPOSSUFICIÊNCIA",
    "",
    `Eu, ${qualificacaoCliente(d.cliente, { contatos: "nenhum" }).replace(/\.$/, "")}, **DECLARO**, sob as penas da lei, para os fins do artigo 5º, LXXIV, da Constituição Federal e dos artigos 98 e 99 do Código de Processo Civil, que:`,
    "",
    "a) não possuo, atualmente, condições financeiras de arcar com as custas e as despesas processuais sem prejuízo do meu próprio sustento e do de minha família;",
    "",
    "b) as informações aqui prestadas são verdadeiras, estando ciente de que a falsidade desta declaração me sujeita às sanções civis, administrativas e criminais cabíveis, inclusive à multa do art. 100, parágrafo único, do Código de Processo Civil.",
    "",
    "Por ser expressão da verdade, firmo a presente declaração.",
    "",
    `${ouLacuna(d.comarca ?? d.cliente.cidade, "comarca")}/${ouLacuna(d.uf ?? d.cliente.uf, "UF")}, data da assinatura eletrônica.`,
    "",
    "",
    `**${d.cliente.nome.toUpperCase()}**`,
    `CPF nº ${d.cliente.cpfCnpj ? formatarCpf(d.cliente.cpfCnpj) : "[[VERIFICAR: CPF]]"}`,
    "",
  ].join("\n");
}
