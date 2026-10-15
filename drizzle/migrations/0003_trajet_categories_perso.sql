create table if not exists public.trajet_categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  actif boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (nom)
);

alter table public.trajet_categories enable row level security;

grant select on public.trajet_categories to authenticated;
grant insert, update, delete on public.trajet_categories to authenticated;
grant all on public.trajet_categories to service_role;

create policy "Lecture categories trajets"
  on public.trajet_categories for select
  to authenticated using (true);

create policy "Creation categories trajets"
  on public.trajet_categories for insert
  to authenticated with check (is_chef_or_admin());

create policy "Modification categories trajets"
  on public.trajet_categories for update
  to authenticated using (is_chef_or_admin()) with check (is_chef_or_admin());

create policy "Suppression categories trajets"
  on public.trajet_categories for delete
  to authenticated using (is_chef_or_admin());

alter table public.trajets add column if not exists categorie_libre text;
comment on column public.trajets.categorie_libre IS 'Nom de categorie personnalisee (quand categorie = ''autre''), suggeree par la table trajet_categories.';