insert into public.agencies (id, name, code)
values
  ('00000000-0000-0000-0000-000000000101', 'Agence Antananarivo', 'TNR'),
  ('00000000-0000-0000-0000-000000000102', 'Agence Toamasina', 'TMM')
on conflict (code) do nothing;
