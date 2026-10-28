-- Seed de desenvolvimento (supabase db reset): dois escritórios sintéticos, equipe e alguns processos.
-- Nunca rodar em produção. Senhas: "senha-dev-123" para todos.

-- Usuários no Auth local (hash bcrypt de "senha-dev-123" gerado pelo pgcrypto)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, extensions.crypt('senha-dev-123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', nome), now(), now()
from (values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'socia@dev.local', 'Bruna (dev)'),
  ('abababab-abab-4bab-8bab-abababababab'::uuid, 'advogado@dev.local', 'Bruno (dev)'),
  ('acacacac-acac-4cac-8cac-acacacacacac'::uuid, 'estagiaria@dev.local', 'Carla (dev)'),
  ('adadadad-adad-4dad-8dad-adadadadadad'::uuid, 'adm@dev.local', 'Dani (dev)'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'socio.b@dev.local', 'Escritório B (dev)')
) as u(id, email, nome)
on conflict (id) do nothing;

insert into public.escritorios (id, nome, razao_social) values
  ('11111111-1111-4111-8111-111111111111', 'Escritório A (dev)', 'Escritório A Sociedade de Advogados'),
  ('22222222-2222-4222-8222-222222222222', 'Escritório B (dev)', 'Escritório B')
on conflict (id) do nothing;

insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf, aceito_em) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'socia@dev.local', 'socio', 'Bruna (dev)', '20817', 'MT', now()),
  ('11111111-1111-4111-8111-111111111111', 'abababab-abab-4bab-8bab-abababababab', 'advogado@dev.local', 'advogado', 'Bruno (dev)', '30000', 'MT', now()),
  ('11111111-1111-4111-8111-111111111111', 'acacacac-acac-4cac-8cac-acacacacacac', 'estagiaria@dev.local', 'estagiario', 'Carla (dev)', null, null, now()),
  ('11111111-1111-4111-8111-111111111111', 'adadadad-adad-4dad-8dad-adadadadadad', 'adm@dev.local', 'administrativo', 'Dani (dev)', null, null, now()),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'socio.b@dev.local', 'socio', 'Sócio B (dev)', '40000', 'MT', now())
on conflict (escritorio_id, email_convite) do nothing;

-- Clientes e processos (números CNJ válidos: dígito verificador módulo 97)
insert into public.clientes (id, escritorio_id, tipo_pessoa, nome, cpf_cnpj) values
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', '11111111-1111-4111-8111-111111111111', 'fisica', 'Marina Silva (dev)', '00000000191'),
  ('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', '11111111-1111-4111-8111-111111111111', 'juridica', 'Comércio Exemplo Ltda (dev)', '00000000000191')
on conflict (id) do nothing;

do $$
declare
  v_tjmt uuid := (select id from ref.tribunais where sigla = 'TJMT');
  v_cuiaba uuid := (select id from ref.comarcas where nome = 'Cuiabá');
  v_p1 uuid;
  v_p2 uuid;
begin
  -- 1002345 / 2025 / 8.11.0041 → DV calculado: base 1002345 2025 8 11 0041 00 mod 97
  insert into public.processos (escritorio_id, numero_cnj, tribunal_id, comarca_id, responsavel_id, classe_nome, status)
  values ('11111111-1111-4111-8111-111111111111', lpad('1002345', 7, '0') || lpad((98 - (('1002345' || '2025' || '8' || '11' || '0041' || '00')::numeric % 97)::int)::text, 2, '0') || '2025' || '8' || '11' || '0041', v_tjmt, v_cuiaba, 'abababab-abab-4bab-8bab-abababababab', 'Procedimento Comum Cível', 'ativo')
  on conflict (escritorio_id, numero_cnj) do nothing
  returning id into v_p1;
  insert into public.processos (escritorio_id, numero_cnj, tribunal_id, comarca_id, responsavel_id, classe_nome, status, segredo_justica)
  values ('11111111-1111-4111-8111-111111111111', lpad('1009876', 7, '0') || lpad((98 - (('1009876' || '2024' || '8' || '11' || '0041' || '00')::numeric % 97)::int)::text, 2, '0') || '2024' || '8' || '11' || '0041', v_tjmt, v_cuiaba, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Divórcio Litigioso', 'ativo', true)
  on conflict (escritorio_id, numero_cnj) do nothing
  returning id into v_p2;
  if v_p1 is not null then
    insert into public.processo_partes (escritorio_id, processo_id, nome, polo, cliente_id, eh_cliente) values
      ('11111111-1111-4111-8111-111111111111', v_p1, 'Marina Silva (dev)', 'ativo', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', true),
      ('11111111-1111-4111-8111-111111111111', v_p1, 'Banco Exemplo S.A.', 'passivo', null, false);
  end if;
  if v_p2 is not null then
    insert into public.processo_partes (escritorio_id, processo_id, nome, polo, cliente_id, eh_cliente) values
      ('11111111-1111-4111-8111-111111111111', v_p2, 'Comércio Exemplo Ltda (dev)', 'passivo', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', true);
  end if;
end
$$;
