import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { timbreDoEscritorio } from "@/server/contratos";
import { NavegacaoConfiguracoes } from "../navegacao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { salvarTimbreAction } from "./actions";

export const metadata = { title: "Documentos" };
export const dynamic = "force-dynamic";

export default async function PaginaDocumentosConfig({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const t = await timbreDoEscritorio(supabase, sessao.escritorioId);
  return (
    <div className="flex flex-col gap-4">
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/documentos" />
      <h1 className="text-xl font-semibold">Documentos gerados</h1>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Timbre e qualificação do escritório</CardTitle>
          <CardDescription>Nome, razão social e CNPJ vêm de Configurações → Escritório. O resto entra no cabeçalho, no rodapé e na qualificação da CONTRATADA/OUTORGADA dos contratos e procurações.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={salvarTimbreAction} className="grid gap-2 sm:grid-cols-3">
            <Campo label="Endereço (logradouro e número)" className="sm:col-span-2"><Input name="endereco" defaultValue={t.endereco ?? ""} /></Campo>
            <Campo label="Bairro"><Input name="bairro" defaultValue={t.bairro ?? ""} /></Campo>
            <Campo label="Cidade"><Input name="cidade" defaultValue={t.cidade ?? ""} /></Campo>
            <Campo label="UF"><Input name="uf" defaultValue={t.uf ?? "MT"} maxLength={2} /></Campo>
            <Campo label="CEP"><Input name="cep" defaultValue={t.cep ?? ""} /></Campo>
            <Campo label="Telefone/WhatsApp"><Input name="telefone" defaultValue={t.telefone ?? ""} /></Campo>
            <Campo label="E-mail do escritório"><Input name="email" defaultValue={t.email ?? ""} type="email" /></Campo>
            <Campo label="Site"><Input name="site" defaultValue={t.site ?? ""} /></Campo>
            <Campo label="Advogada(o) responsável"><Input name="advogadaNome" defaultValue={t.advogadaNome ?? ""} /></Campo>
            <Campo label="OAB (ex.: 20.817-O)"><Input name="advogadaOab" defaultValue={t.advogadaOab ?? ""} /></Campo>
            <Campo label="Nacionalidade"><Input name="advogadaNacionalidade" defaultValue={t.advogadaNacionalidade ?? "brasileira"} /></Campo>
            <Campo label="Estado civil"><Input name="advogadaEstadoCivil" defaultValue={t.advogadaEstadoCivil ?? ""} /></Campo>
            <Campo label="CPF (opcional, vai na procuração)"><Input name="advogadaCpf" defaultValue={t.advogadaCpf ?? ""} /></Campo>
            <Campo label="E-mail profissional da advogada"><Input name="advogadaEmail" defaultValue={t.advogadaEmail ?? ""} type="email" /></Campo>
            <div className="flex items-end sm:col-span-3">
              <Button type="submit">Salvar timbre</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
