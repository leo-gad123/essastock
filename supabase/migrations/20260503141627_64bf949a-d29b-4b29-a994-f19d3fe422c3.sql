
-- Enums
create type public.app_role as enum ('admin', 'user');
create type public.movement_type as enum ('in', 'out');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Items
create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  min_quantity numeric not null default 5,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.items enable row level security;

-- Movements
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  type movement_type not null,
  quantity numeric not null check (quantity > 0),
  note text,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.stock_movements enable row level security;

-- Trigger: on signup create profile + assign role (first user => admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  user_count int;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));

  select count(*) into user_count from public.user_roles;
  if user_count = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: apply stock movement to item.quantity, prevent oversell
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  current_qty numeric;
begin
  select quantity into current_qty from public.items where id = new.item_id for update;
  if current_qty is null then raise exception 'Item not found'; end if;

  if new.type = 'out' then
    if current_qty < new.quantity then
      raise exception 'Insufficient stock: have %, requested %', current_qty, new.quantity;
    end if;
    update public.items set quantity = quantity - new.quantity, updated_at = now() where id = new.item_id;
  else
    update public.items set quantity = quantity + new.quantity, updated_at = now() where id = new.item_id;
  end if;
  return new;
end;
$$;

create trigger trg_apply_stock_movement
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- updated_at helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- RLS Policies
-- profiles: users see all profiles (admins need to list); users update their own; admins update any
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_admin_update" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "profiles_admin_delete" on public.profiles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- user_roles: authenticated read; admin manage
create policy "roles_select_authenticated" on public.user_roles for select to authenticated using (true);
create policy "roles_admin_insert" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "roles_admin_update" on public.user_roles for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "roles_admin_delete" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- items
create policy "items_select_authenticated" on public.items for select to authenticated using (true);
create policy "items_admin_insert" on public.items for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "items_admin_update" on public.items for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "items_admin_delete" on public.items for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- stock_movements: any authenticated can read & insert their own; admins delete
create policy "moves_select_authenticated" on public.stock_movements for select to authenticated using (true);
create policy "moves_insert_self" on public.stock_movements for insert to authenticated with check (auth.uid() = user_id);
create policy "moves_admin_delete" on public.stock_movements for delete to authenticated using (public.has_role(auth.uid(),'admin'));
