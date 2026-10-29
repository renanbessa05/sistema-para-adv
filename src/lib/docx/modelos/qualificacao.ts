import { formatarCep, formatarCnpj, formatarCpf, type Timbre } from "../timbre";
import { ouLacuna } from "../marcadores";
import type { QualificacaoCliente } from "./dados";

/** Qualificação idêntica nos três documentos (item 5 da conferência final da skill). */
export function enderecoCliente(c: QualificacaoCliente): string {
  const linha1 = [ouLacuna(c.logradouro, "logradouro"), c.numero ? `nº ${c.numero}` : null, c.complemento].filter(Boolean).join(", ");
  return linha1;
}

export function qualificacaoCliente(c: QualificacaoCliente, opcoes: { contatos: "cliente" | "escritorio" | "nenhum"; timbre?: Timbre; papel?: string }): string {
  const bairro = ouLacuna(c.bairro, "bairro");
  const municipio = ouLacuna(c.cidade, "município");
  const uf = ouLacuna(c.uf, "UF");
  const cep = c.cep ? formatarCep(c.cep) : "[[VERIFICAR: CEP]]";
  let contatos = "";
  if (opcoes.contatos === "cliente") contatos = `, endereço eletrônico ${ouLacuna(c.email, "e-mail do cliente")}, telefone/WhatsApp ${ouLacuna(c.telefone, "telefone do cliente")}`;
  else if (opcoes.contatos === "escritorio" && opcoes.timbre) contatos = `, endereço eletrônico ${ouLacuna(opcoes.timbre.email, "e-mail do escritório")}, telefone/WhatsApp ${ouLacuna(opcoes.timbre.telefone, "telefone do escritório")}`;
  const sufixoPapel = opcoes.papel ? `, doravante denominado(a) simplesmente ${opcoes.papel}` : "";

  if (c.tipoPessoa === "juridica") {
    const sede = `${enderecoCliente(c)}, ${bairro}, Município de ${municipio}, Estado de ${uf}, CEP ${cep}`;
    return `**${c.nome.toUpperCase()}**, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${c.cpfCnpj ? formatarCnpj(c.cpfCnpj) : "[[VERIFICAR: CNPJ]]"}, com sede na ${sede}${contatos}, neste ato representada por ${ouLacuna(c.representante, "representante legal")}, ${ouLacuna(c.representanteQualificacao, "qualificação do representante")}, na forma de seu ${ouLacuna(c.instrumentoRepresentacao, "contrato social ou estatuto")}${sufixoPapel}.`;
  }
  return `**${c.nome.toUpperCase()}**, ${ouLacuna(c.nacionalidade, "nacionalidade")}, ${ouLacuna(c.estadoCivil, "estado civil")}, ${ouLacuna(c.profissao, "profissão")}, inscrito(a) no CPF sob o nº ${c.cpfCnpj ? formatarCpf(c.cpfCnpj) : "[[VERIFICAR: CPF]]"}, residente e domiciliado(a) na ${enderecoCliente(c)}, ${bairro}, Município de ${municipio}, Estado de ${uf}, CEP ${cep}${contatos}${sufixoPapel}.`;
}

/** Qualificação do escritório (sociedade) representado pela advogada responsável. */
export function qualificacaoEscritorio(t: Timbre, opcoes: { comContatos: boolean }): string {
  const razao = (t.razaoSocial || t.nome || "[[VERIFICAR: razão social do escritório]]").toUpperCase();
  const sede = [ouLacuna(t.endereco, "endereço do escritório"), t.bairro ? `Bairro ${t.bairro}` : null, t.cidade && t.uf ? `${t.cidade}/${t.uf}` : "[[VERIFICAR: cidade/UF do escritório]]", t.cep ? `CEP ${formatarCep(t.cep)}` : "[[VERIFICAR: CEP do escritório]]"].filter(Boolean).join(", ");
  const contatos = opcoes.comContatos ? `, endereço eletrônico ${ouLacuna(t.email, "e-mail do escritório")}, telefone/WhatsApp ${ouLacuna(t.telefone, "telefone do escritório")}` : "";
  const advogada = `**${(t.advogadaNome ?? "[[VERIFICAR: advogada responsável]]").toUpperCase()}**, ${ouLacuna(t.advogadaNacionalidade, "nacionalidade da advogada")}${t.advogadaEstadoCivil ? `, ${t.advogadaEstadoCivil}` : ""}, advogada inscrita na OAB/${t.uf ?? "MT"} sob nº ${ouLacuna(t.advogadaOab, "OAB da advogada")}${t.advogadaCpf ? ` e no CPF sob o nº ${formatarCpf(t.advogadaCpf)}` : ""}${t.advogadaEmail ? `, com endereço eletrônico profissional ${t.advogadaEmail}` : ""}`;
  return `**${razao}**, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${t.cnpj ? formatarCnpj(t.cnpj) : "[[VERIFICAR: CNPJ do escritório]]"}, com sede na ${sede}${contatos}, neste ato representada pela advogada ${advogada}`;
}
