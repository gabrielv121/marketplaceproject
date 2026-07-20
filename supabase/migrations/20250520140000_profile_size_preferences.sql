-- Persist account size preferences for shoe and apparel.

alter table public.profiles
  add column if not exists preferred_shoe_size text;

alter table public.profiles
  add column if not exists preferred_apparel_size text;

comment on column public.profiles.preferred_shoe_size is
  'User preferred shoe size label, e.g. US 10 or US 10.5.';

comment on column public.profiles.preferred_apparel_size is
  'User preferred apparel size label, e.g. M or XL.';
