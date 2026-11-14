-- Demo mode: lets the app complete a rent payment without Razorpay while gateway keys
-- are not set up. Uses the exact same paid-path as the webhook (apply_gateway_payment).
-- Turn OFF before go-live:  update private.app_config set value = 'off' where key = 'demo_mode';

insert into private.app_config (key, value) values ('demo_mode', 'on')
on conflict (key) do nothing;

create or replace function public.is_demo_mode()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select value = 'on' from private.app_config where key = 'demo_mode'), false);
$$;
grant execute on function public.is_demo_mode() to authenticated, anon;

create or replace function public.demo_pay_rent(p_rental uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  pay record;
  v_order text;
begin
  if not public.is_demo_mode() then
    raise exception 'Demo payments are switched off' using errcode = '42501';
  end if;
  -- same checks + server-side amount as a real payment (ownership, status, renewal hold)
  select * into pay from public.prepare_rent_payment(p_rental);
  v_order := 'order_demo_' || replace(pay.payment_id::text, '-', '');
  update public.payments set razorpay_order_id = v_order where id = pay.payment_id;

  perform public.enter_trusted();
  perform public.apply_gateway_payment(v_order, 'pay_demo_' || substr(md5(random()::text), 1, 14), round(pay.amount * 100)::bigint);
  return pay.payment_id;
end $$;
grant execute on function public.demo_pay_rent(uuid) to authenticated;

select private.pin_timezone();
