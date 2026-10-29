export const metadata = { title: "Política de privacidade" };

/**
 * Texto GENÉRICO. Os pontos jurídicos, o nome do encarregado e o canal de contato são placeholders: a advogada/DPO
 * confirma antes de publicar (a confirmar). Não há dado de contato inventado aqui.
 */
export default function PaginaPrivacidade() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed">
      <h1 className="mb-4 text-2xl font-semibold">Política de privacidade</h1>
      <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
        Versão de modelo. Todos os pontos marcados como (a confirmar) dependem de revisão jurídica pela advogada responsável e pelo encarregado antes da publicação.
      </p>

      <h2 className="mt-6 text-lg font-semibold">1. Quem trata os dados</h2>
      <p>
        O escritório [nome e CNPJ a confirmar] atua como controlador dos dados pessoais tratados para a prestação de serviços advocatícios (a confirmar).
      </p>

      <h2 className="mt-6 text-lg font-semibold">2. Encarregado e contato</h2>
      <p>
        Encarregado pelo tratamento de dados: [nome do encarregado a indicar] (a confirmar). Canal para solicitações: [e-mail de contato a indicar] (a confirmar).
      </p>

      <h2 className="mt-6 text-lg font-semibold">3. Quais dados e para quê</h2>
      <p>
        Tratamos dados de clientes, partes contrárias e advogados para o exercício da advocacia, incluindo acompanhamento de processos e publicações oficiais,
        cálculo de prazos e comunicação com clientes. Dados sensíveis constantes dos autos são tratados somente na medida necessária ao processo (base legal a confirmar).
      </p>

      <h2 className="mt-6 text-lg font-semibold">4. Bases legais</h2>
      <p>Execução de contrato e exercício regular de direitos em processo judicial (artigos a confirmar com a advogada/DPO).</p>

      <h2 className="mt-6 text-lg font-semibold">5. Fornecedores e transferência internacional</h2>
      <p>
        Usamos provedores de infraestrutura, mensagens e inteligência artificial, alguns com servidores fora do Brasil. Contratos e salvaguardas: (a confirmar).
        Para inteligência artificial, enviamos somente o texto necessário à tarefa, sem usar os dados para treinar modelos (a confirmar).
      </p>

      <h2 className="mt-6 text-lg font-semibold">6. Por quanto tempo guardamos</h2>
      <p>
        Os prazos de retenção seguem a regra interna do escritório, com base na responsabilidade profissional e em obrigações legais (prazos a confirmar).
        Dados não são descartados automaticamente sem decisão registrada.
      </p>

      <h2 className="mt-6 text-lg font-semibold">7. Direitos do titular</h2>
      <p>
        Você pode pedir confirmação de tratamento, acesso, correção, anonimização ou eliminação, portabilidade e revogação de consentimento, nos termos do artigo 18 da Lei 13.709/2018 (LGPD).
        Os prazos de resposta são (a confirmar). Pedidos são feitos pelo canal indicado no item 2.
      </p>

      <h2 className="mt-6 text-lg font-semibold">8. Segurança e atualizações</h2>
      <p>
        Controles de acesso por função, segundo fator de autenticação e registro de acesso a textos sigilosos. Esta política pode ser atualizada; a data da última revisão: [a indicar].
      </p>
    </main>
  );
}
