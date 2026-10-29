-- 0046: novo papel 'suporte' (equipe de suporte da plataforma, acesso temporário a um escritório).
-- Arquivo próprio: ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação. Nenhuma migration deste lote
-- grava o valor 'suporte' em coluna do tipo papel; as seguintes só comparam o texto do claim (app.papel_atual()).
-- Nenhum usuário existente muda: o valor só passa a existir.

alter type public.papel add value if not exists 'suporte';
