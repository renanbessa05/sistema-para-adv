import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";

export type ClienteFormulario = {
  tipo_pessoa?: string | null;
  nome?: string | null;
  cpf_cnpj?: string | null;
  email?: string | null;
  telefone_e164?: string | null;
  endereco?: Record<string, string | null> | null;
  observacoes?: string | null;
  ativo?: boolean | null;
};

/** Campos do cadastro de cliente (server component). O endereço jsonb vira campos separados. */
export function CamposCliente({ valor, mostrarAtivo }: { valor?: ClienteFormulario | null; mostrarAtivo?: boolean }) {
  const end = valor?.endereco ?? {};
  return (
    <div className="flex flex-col gap-6">
      <GrupoCampos titulo="Identificação" colunas={2}>
        <Campo label="Nome / razão social" className="sm:col-span-2">
          <Input name="nome" required defaultValue={valor?.nome ?? ""} />
        </Campo>
        <Campo label="Tipo de pessoa">
          <Select name="tipo_pessoa" defaultValue={valor?.tipo_pessoa ?? "fisica"}>
            <option value="fisica">Pessoa física</option>
            <option value="juridica">Pessoa jurídica</option>
          </Select>
        </Campo>
        <Campo label="CPF/CNPJ" dica="Somente números; a formatação é automática.">
          <Input name="cpf_cnpj" defaultValue={valor?.cpf_cnpj ?? ""} placeholder="somente números" inputMode="numeric" className="font-mono" />
        </Campo>
      </GrupoCampos>

      <GrupoCampos titulo="Contato" colunas={2}>
        <Campo label="E-mail">
          <Input name="email" type="email" defaultValue={valor?.email ?? ""} />
        </Campo>
        <Campo label="Telefone (WhatsApp)" dica="Com DDI e DDD, no formato +5565999990000.">
          <Input name="telefone_e164" defaultValue={valor?.telefone_e164 ?? ""} placeholder="+5565999990000" inputMode="tel" />
        </Campo>
      </GrupoCampos>

      <GrupoCampos titulo="Endereço" descricao="Usado na qualificação do contrato e da procuração." colunas={3}>
        <Campo label="Logradouro" className="sm:col-span-2">
          <Input name="logradouro" defaultValue={end.logradouro ?? ""} />
        </Campo>
        <Campo label="Número">
          <Input name="numero" defaultValue={end.numero ?? ""} />
        </Campo>
        <Campo label="Complemento">
          <Input name="complemento" defaultValue={end.complemento ?? ""} />
        </Campo>
        <Campo label="Bairro">
          <Input name="bairro" defaultValue={end.bairro ?? ""} />
        </Campo>
        <Campo label="CEP">
          <Input name="cep" defaultValue={end.cep ?? ""} inputMode="numeric" />
        </Campo>
        <Campo label="Cidade" className="sm:col-span-2">
          <Input name="cidade" defaultValue={end.cidade ?? ""} />
        </Campo>
        <Campo label="UF">
          <Input name="uf" defaultValue={end.uf ?? "MT"} maxLength={2} className="uppercase" />
        </Campo>
      </GrupoCampos>

      <GrupoCampos titulo="Outros" colunas={2}>
        <Campo label="Observações" className={mostrarAtivo ? undefined : "sm:col-span-2"}>
          <Textarea name="observacoes" defaultValue={valor?.observacoes ?? ""} rows={2} className="min-h-20" />
        </Campo>
        {mostrarAtivo ? (
          <Campo label="Situação" dica="Cliente inativo sai das listas, mas o histórico fica.">
            <Select name="ativo" defaultValue={valor?.ativo === false ? "0" : "1"}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </Select>
          </Campo>
        ) : null}
      </GrupoCampos>
    </div>
  );
}
