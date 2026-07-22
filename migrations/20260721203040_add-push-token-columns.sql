-- Expo push notification tokens, one device token per account row.
-- Written by the app after login (src/lib/notifications.ts).
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS push_token text;

-- drivers uses column-level UPDATE grants (see
-- 20260709075443_add-driver-wallet-ledger-and-trip-completion.sql), so the
-- new column needs its own grant or client updates are permission-denied.
-- customers has a plain row-level policy with the default full UPDATE grant,
-- so no extra grant is needed there.
GRANT UPDATE (push_token) ON public.drivers TO authenticated;
