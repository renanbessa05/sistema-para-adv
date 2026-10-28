import { extrairDigitosCnj, validarDigitosCnj } from "@/lib/cnj";
import type { ClienteIa, RespostaEstruturada } from "./cliente";
import { delimitarDado } from "./custo";
import { SISTEMA, VERSAO } from "./prompts/classificador-publicacao.v0";
import { ClassificacaoPublicacaoSchema, type ClassificacaoPublicacao } from "./schemas/classificacao";

export const AGENTE_CLASSIFICADOR = "classificador_publicacao";

export interface EntradaClassificacao {
  texto: string;
  tribunal?: string | null;
  tipoOrigem?: string | null;
  orgao?: string | null;
  classe?: string | null;
  dataDisponibilizacao?: string | null;
  /** Advogados do escritório (nome e OAB) para ajudar a identificar o destinatário. */
  advogadosDoEscritorio?: { nome: string; oab?: string | null }[];
}

export interface ResultadoClassificacao extends RespostaEstruturada<ClassificacaoPublicacao> {
  agente: string;
  agenteVersao: string;
  /** Número CNJ validado (dígito verificador) ou null. */
  numeroCnjValidado: string | null;
}

export function montarMensagemUsuario(entrada: EntradaClassificacao): string {
  const cabecalho = [
    entrada.tribunal ? `Tribunal: ${entrada.tribunal}` : null,
    entrada.tipoOrigem ? `Tipo informado pelo DJEN: ${entrada.tipoOrigem}` : null,
    entrada.orgao ? `Órgão: ${entrada.orgao}` : null,
    entrada.classe ? `Classe: ${entrada.classe}` : null,
    entrada.dataDisponibilizacao ? `Disponibilizada em: ${entrada.dataDisponibilizacao}` : null,
    entrada.advogadosDoEscritorio?.length
      ? `Advogados do escritório: ${entrada.advogadosDoEscritorio.map((a) => (a.oab ? `${a.nome} (OAB ${a.oab})` : a.nome)).join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const texto = entrada.texto.length > 12_000 ? `${entrada.texto.slice(0, 12_000)}\n[texto truncado]` : entrada.texto;
  return `${cabecalho}\n\n${delimitarDado("comunicacao_djen", texto)}`;
}

export async function classificarPublicacao(entrada: EntradaClassificacao, deps: { cliente: ClienteIa; modelo: string }): Promise<ResultadoClassificacao> {
  const resposta = await deps.cliente.gerarEstruturado({
    agente: AGENTE_CLASSIFICADOR,
    modelo: deps.modelo,
    sistema: SISTEMA,
    cacheSistema: true,
    usuario: montarMensagemUsuario(entrada),
    schema: ClassificacaoPublicacaoSchema,
    maxTokens: 1024,
  });

  // O modelo sugere; o código valida o que dá para validar.
  const dados = { ...resposta.dados };
  let numeroCnjValidado: string | null = null;
  if (dados.numero_cnj) {
    const digitos = extrairDigitosCnj(dados.numero_cnj);
    if (digitos && validarDigitosCnj(digitos)) numeroCnjValidado = digitos;
    else dados.observacoes = [dados.observacoes, "número CNJ sugerido pelo modelo não passou na validação"].filter(Boolean).join("; ");
  }
  if (!numeroCnjValidado) {
    const doTexto = extrairDigitosCnj(entrada.texto);
    if (doTexto && validarDigitosCnj(doTexto)) numeroCnjValidado = doTexto;
  }
  if (!dados.gera_prazo) {
    dados.ato = null;
    dados.dias_sugeridos = null;
    dados.contagem = null;
  }

  return { ...resposta, dados, agente: AGENTE_CLASSIFICADOR, agenteVersao: VERSAO, numeroCnjValidado };
}
