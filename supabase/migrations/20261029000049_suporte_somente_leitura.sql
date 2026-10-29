-- 0049: suporte só lê, e só com acesso_suporte vigente (docs/regras/permissoes.md, "Suporte")
--
-- Policies RESTRITIVAS somam-se às permissivas já existentes (tenant_isolamento, escrita por papel etc.). Elas só
-- estreitam: nunca concedem acesso. Para qualquer papel diferente de 'suporte' a expressão é verdadeira e nada muda.
-- Para o papel 'suporte': leitura só se app.acesso_suporte_vigente(escritório atual); escrita (insert/update/delete)
-- nunca. Cobre TODAS as tabelas de public com RLS ligado, inclusive as sem escritorio_id (ex.: processo_assuntos).
-- Tabelas criadas depois precisam repetir este bloco (ver docs/regras/permissoes.md).

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity
  loop
    execute format('drop policy if exists suporte_somente_leitura on public.%I', t.relname);
    execute format(
      $p$create policy suporte_somente_leitura on public.%I as restrictive for select to authenticated
           using (coalesce(app.papel_atual(), '') <> 'suporte' or app.acesso_suporte_vigente(app.escritorio_atual()))$p$,
      t.relname
    );

    execute format('drop policy if exists suporte_sem_escrita_insert on public.%I', t.relname);
    execute format(
      $p$create policy suporte_sem_escrita_insert on public.%I as restrictive for insert to authenticated
           with check (coalesce(app.papel_atual(), '') <> 'suporte')$p$,
      t.relname
    );

    execute format('drop policy if exists suporte_sem_escrita_update on public.%I', t.relname);
    execute format(
      $p$create policy suporte_sem_escrita_update on public.%I as restrictive for update to authenticated
           using (coalesce(app.papel_atual(), '') <> 'suporte')
           with check (coalesce(app.papel_atual(), '') <> 'suporte')$p$,
      t.relname
    );

    execute format('drop policy if exists suporte_sem_escrita_delete on public.%I', t.relname);
    execute format(
      $p$create policy suporte_sem_escrita_delete on public.%I as restrictive for delete to authenticated
           using (coalesce(app.papel_atual(), '') <> 'suporte')$p$,
      t.relname
    );
  end loop;
end
$$;
