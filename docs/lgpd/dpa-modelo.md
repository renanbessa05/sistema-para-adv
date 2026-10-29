# Modelo de DPA (acordo de tratamento) com fornecedores

Status: modelo para revisão jurídica. Não é contrato. Todos os pontos marcados (a confirmar) dependem da advogada/DPO.

## Partes

- Controlador: o escritório [razão social e CNPJ a confirmar].
- Operador: cada fornecedor listado em `docs/lgpd/fornecedores.md`.
- Encarregado: [nome a indicar] (a confirmar). Canal: [e-mail a indicar] (a confirmar).

## Cláusulas mínimas a exigir ou verificar

1. Finalidade: o operador trata dados só para prestar o serviço contratado ao escritório, por instrução documentada.
2. Subcontratados: lista atualizada e aviso prévio de troca (a confirmar com cada fornecedor).
3. Segurança: criptografia em trânsito e em repouso, controle de acesso, registro de acesso. Descrição técnica anexa do fornecedor.
4. Incidentes: aviso ao controlador em prazo compatível com a comunicação à ANPD (a confirmar; o DPA da Anthropic prevê 48 h, ver `fornecedores.md`).
5. Transferência internacional: salvaguarda vigente. Hoje o caminho previsto é o art. 33, IX da LGPD, enquanto as cláusulas-padrão da ANPD (Res. CD/ANPD 19/2024) não forem incorporadas (a confirmar).
6. Não treinamento: o operador não usa dados do escritório para treinar modelos (verificar a cláusula de cada termo).
7. Retenção e exclusão: o operador apaga ou devolve os dados ao fim do contrato e informa a retenção de logs (prazo a confirmar por fornecedor).
8. Auxílio ao controlador: atendimento de pedidos de titulares e de autoridades, no prazo que o escritório fixar (a confirmar).
9. Auditoria: direito de o controlador receber evidências de conformidade (relatórios ou certificações do fornecedor).

## Checklist de assinatura

- [ ] DPA do fornecedor obtido e arquivado fora do repositório.
- [ ] Cláusulas acima verificadas; lacunas registradas em `fornecedores.md`.
- [ ] Encarregado e canal de contato publicados em `/privacidade` (placeholders hoje).
- [ ] RIPD concluído antes de dados reais (ver `bases-legais.md`).
