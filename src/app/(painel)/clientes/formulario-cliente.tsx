import { Campo, Input, Select, Textarea } from "@/components/ui/input";

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
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo label="Tipo de pessoa">
        <Select name="tipo_pessoa" defaultValue={valor?.tipo_pessoa ?? "fisica"}>
          <option value="fisica">Pessoa física</option>
          <option value="juridica">Pessoa jurídica</option>
        </Select>
      </Campo>
      <Campo label="CPF/CNPJ">
        <Input name="cpf_cnpj" defaultValue={valor?.cpf_cnpj ?? ""} placeholder="somente números" inputMode="numeric" />
      </Campo>
      <Campo label="Nome / razão social" className="sm:col-span-2">
        <Input name="nome" required defaultValue={valor?.nome ?? ""} />
      </Campo>
      <Campo label="E-mail">
        <Input name="email" type="email" defaultValue={valor?.email ?? ""} />
      </Campo>
      <Campo label="Telefone (WhatsApp)">
        <Input name="telefone_e164" defaultValue={valor?.telefone_e164 ?? ""} placeholder="+5565999990000" />
      </Campo>
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
      <Campo label="Cidade">
        <Input name="cidade" defaultValue={end.cidade ?? ""} />
      </Campo>
      <Campo label="UF">
        <Input name="uf" defaultValue={end.uf ?? "MT"} maxLength={2} />
      </Campo>
      <Campo label="Observações" className="sm:col-span-2">
        <Textarea name="observacoes" defaultValue={valor?.observacoes ?? ""} rows={2} />
      </Campo>
      {mostrarAtivo ? (
        <Campo label="Situação">
          <Select name="ativo" defaultValue={valor?.ativo === false ? "0" : "1"}>
            <option value="1">Ativo</option>
            <option value="0">Inativo</option>
          </Select>
        </Campo>
      ) : null}
    </div>
  );
}
