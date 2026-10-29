/**
 * Pacote de exportação dos dados de um titular (LGPD, art. 18, II e V). Puro: recebe dados já lidos e devolve os
 * arquivos de texto que o servidor empacota em ZIP. Não inclui o conteúdo dos documentos anexados nesta versão:
 * só os metadados (ver LEIA-ME no pacote e docs/runbooks/solicitacao-de-titular.md).
 */

export interface DadosTitular {
  cliente: {
    id: string;
    nome: string;
    tipo_pessoa: string;
    cpf_cnpj: string | null;
    email: string | null;
    telefone_e164: string | null;
    endereco: unknown;
    observacoes: string | null;
    criado_em: string;
  };
  processos: { processo_id: string; numero_cnj: string; polo: string; nome_na_parte: string }[];
  documentos: { id: string; nome: string; tipo: string; mime: string; tamanho: number; criado_em: string }[];
}

export interface ArquivoPacote {
  nome: string;
  conteudo: string;
}

export function montarPacoteTitular(dados: DadosTitular, geradoEm: string): ArquivoPacote[] {
  const titular = JSON.stringify(dados.cliente, null, 2);
  const processos = JSON.stringify(dados.processos, null, 2);
  const documentos = JSON.stringify(dados.documentos, null, 2);
  const leiame = [
    "Exportação de dados pessoais de titular",
    `Gerada em: ${geradoEm}`,
    "",
    "Arquivos:",
    "- titular.json: dados cadastrais do titular guardados pelo escritório.",
    "- processos.json: processos em que o titular figura como parte, com o polo.",
    "- documentos.json: metadados dos documentos vinculados ao titular (nome, tipo, tamanho, data). O conteúdo dos arquivos não está neste pacote.",
    "",
    "Dados de processos sigilosos só aparecem para quem tem permissão de sigilo no escritório.",
    "Para dúvidas sobre esta exportação, procure o encarregado indicado na política de privacidade (a confirmar).",
    "",
  ].join("\n");
  return [
    { nome: "LEIA-ME.txt", conteudo: leiame },
    { nome: "titular.json", conteudo: titular },
    { nome: "processos.json", conteudo: processos },
    { nome: "documentos.json", conteudo: documentos },
  ];
}

/** Nome do ZIP: só caracteres seguros, com a data (AAAA-MM-DD) para facilitar o arquivo. */
export function nomeDoPacote(clienteId: string, dataIso: string): string {
  const id = clienteId.replace(/[^a-zA-Z0-9-]/g, "");
  const data = /^\d{4}-\d{2}-\d{2}$/.test(dataIso) ? dataIso : "data-invalida";
  return `titular-${id}-${data}.zip`;
}
