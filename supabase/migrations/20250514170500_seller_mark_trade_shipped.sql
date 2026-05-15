-- Let sellers confirm they dropped off / shipped a prepaid-label trade to EXCH.

create or replace function public.seller_mark_trade_shipped(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.p2p_trades t
  set
    status = 'seller_shipped_to_exch',
    seller_shipped_at = now()
  where t.id = p_trade_id
    and t.seller_id = auth.uid()
    and t.status in ('paid', 'seller_notified')
    and t.seller_label_url is not null;

  if not found then
    raise exception 'seller_shipped_not_allowed';
  end if;
end;
$$;

revoke all on function public.seller_mark_trade_shipped(uuid) from public;
grant execute on function public.seller_mark_trade_shipped(uuid) to authenticated;
