# Registro das operações de tratamento (LGPD, art. 37)

Controlador: o escritório. Encarregado: a sócia (até nomeação formal). Atualizar a cada módulo novo. Este registro é o inventário; o log de acesso a textos sigilosos fica em `auditoria_acessos`.

| Operação | Dados | Titulares | Base legal | Origem | Compartilhamento | Retenção |
|---|---|---|---|---|---|---|
| Cadastro da equipe | nome, e-mail, OAB, telefone, papel | membros do escritório | execução de contrato (art. 7º, V) e legítimo interesse (IX) | o próprio membro | Supabase (banco), Vercel (app), Meta (telefone, pelo WhatsApp), Resend (e-mail) | enquanto ativo + 5 anos |
| Carteira de processos e clientes | nome, CPF/CNPJ, contatos, endereço, polo, número do processo | clientes e partes contrárias | execução de contrato e exercício regular de direitos em processo (art. 7º, V e VI); dados sensíveis: art. 11, II, "d" | cliente, PJe, DJEN, DataJud | Supabase; Anthropic (só o texto da publicação, para classificação) | vigência do mandato + 5 anos (prazo prescricional de responsabilidade) |
| Captação de publicações (DJEN) | texto da comunicação, partes, advogados | partes do processo, advogados | exercício regular de direitos (art. 7º, VI); dado público do diário oficial | API pública do CNJ | Supabase; Anthropic (classificação) | 5 anos após arquivamento do processo |
| Movimentações (DataJud) | movimentos, classe, órgão | partes (indiretamente) | exercício regular de direitos; dado público com termos de uso do CNJ (não coletar dados pessoais de terceiros além do necessário) | API pública do CNJ | Supabase | idem |
| Sugestão de prazo e classificação por IA | texto da publicação, resultado da classificação | partes | exercício regular de direitos | sistema | Anthropic (EUA): transferência internacional; ver `fornecedores.md` | log por 5 anos |
| Aprovações e eventos | quem aprovou o quê, quando, conteúdo aprovado | membros | obrigação legal/profissional (responsabilidade do advogado) | sistema | nenhum | 5 anos |
| Conversas pelo WhatsApp (equipe) | telefone, mensagens, intents | membros | execução de contrato; consentimento (opt-in) para o canal | o próprio membro | Meta (EUA): transferência internacional | 1 ano; metadados 5 anos |
| Notificações por e-mail | e-mail, resumo de prazos (números de processo, atos) | membros | execução de contrato | sistema | Resend | 90 dias no provedor |
| Auditoria de acesso a textos sigilosos | quem leu, quando | membros | obrigação legal (art. 46) e segredo de justiça (CPC art. 189) | sistema | nenhum | 5 anos |

Direitos dos titulares: pedidos de acesso, correção e exclusão chegam ao encarregado; exclusão de cliente respeita a retenção legal (o processo e os registros de aprovação não podem ser apagados antes do prazo).
