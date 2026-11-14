-- SNIREVA seed data. Values marked PLACEHOLDER must be confirmed by the client.

insert into public.settings (id, weekly_rent, deposit_amount, late_fee_per_day, grace_days,
  support_phone, support_whatsapp, support_email, company_name, company_address)
values (1, 1820, 2000 /* PLACEHOLDER */, 50 /* PLACEHOLDER */, 1 /* PLACEHOLDER */,
  '+910000000000' /* PLACEHOLDER */, '+910000000000' /* PLACEHOLDER */, 'support@snireva.in' /* PLACEHOLDER */,
  'SNIREVA Pvt. Ltd.', 'Hyderabad, Telangana' /* PLACEHOLDER */)
on conflict (id) do nothing;

insert into public.pickup_locations (id, name, address) values
  ('10000000-0000-0000-0000-000000000001', 'Madhapur hub', 'Plot 12, Ayyappa Society, Madhapur, Hyderabad'),
  ('10000000-0000-0000-0000-000000000002', 'Kukatpally hub', 'Near JNTU Metro, Kukatpally, Hyderabad'),
  ('10000000-0000-0000-0000-000000000003', 'Gachibowli hub', 'DLF Road, Gachibowli, Hyderabad')
on conflict (id) do nothing;

insert into public.scooters (code, model, chassis_no, motor_no, battery_no, battery_details, status) values
  ('SNR-001', 'Velo Cargo 2.0', 'CH-24A-0001', 'MT-0001', 'BT-0001', '60V 30Ah Li-ion, ~90 km range', 'available'),
  ('SNR-002', 'Velo Cargo 2.0', 'CH-24A-0002', 'MT-0002', 'BT-0002', '60V 30Ah Li-ion, ~90 km range', 'available'),
  ('SNR-003', 'Velo Cargo 2.0', 'CH-24A-0003', 'MT-0003', 'BT-0003', '60V 30Ah Li-ion, ~90 km range', 'available'),
  ('SNR-004', 'Urban Lite',     'CH-24B-0004', 'MT-0004', 'BT-0004', '48V 26Ah Li-ion, ~70 km range', 'available'),
  ('SNR-005', 'Urban Lite',     'CH-24B-0005', 'MT-0005', 'BT-0005', '48V 26Ah Li-ion, ~70 km range', 'under_maintenance'),
  ('SNR-006', 'Urban Lite',     'CH-24B-0006', 'MT-0006', 'BT-0006', '48V 26Ah Li-ion, ~70 km range', 'available')
on conflict (code) do nothing;

insert into public.agreement_templates (version, body) values (1,
$tpl$SCOOTER RENTAL AGREEMENT

This agreement is made on {{start_date}} between {{company_name}}, {{company_address}} ("the Company") and {{customer_name}}, phone {{customer_phone}}, residing at {{customer_address}} ("the Rider").

1. Vehicle
The Company rents to the Rider the electric scooter {{scooter_code}} ({{scooter_model}}), chassis no. {{chassis_no}}, motor no. {{motor_no}}, battery no. {{battery_no}}, together with one charger and the accessories listed in the handover record.

2. Rent and deposit
Rent is {{weekly_rent}} per week, payable in advance every 7 days. A refundable security deposit of {{deposit_amount}} is payable at handover. Renewal of each weekly period is subject to payment and Company approval.

3. Late payment
If rent is not paid within {{grace_days}} day(s) of the due date, a late fee of {{late_fee_per_day}} per day applies and the Company may recover the scooter.

4. Battery and charger
The Rider must charge the battery only with the supplied charger, must not open or tamper with the battery, and is responsible for loss of or damage to the battery or charger caused by misuse.

5. Damage and accidents
The Rider must report any accident, theft or damage to the Company within 24 hours. Repair costs for damage caused by negligence or misuse will be recovered from the Rider and may be adjusted against the deposit.

6. Use
The scooter is for the Rider's own delivery work only. It must not be sub-let, modified, or used for racing or carrying more than the permitted load. The Rider must hold a valid licence where required and follow traffic laws. Traffic fines during the rental are the Rider's responsibility.

7. Return and termination
Either party may end the rental with notice. On return the scooter, battery, charger and accessories are inspected; outstanding rent, late fees and damage costs are settled before the deposit is refunded. The Company may terminate immediately for non-payment, misuse or breach of these terms.

8. Data
The Rider consents to the Company storing the documents and details provided for identity verification and rental administration.
$tpl$)
on conflict (version) do nothing;
