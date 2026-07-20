import { insforge } from '@/lib/insforge';

/**
 * Driver wallet reads against InsForge.
 *
 * wallet_balance and wallet_transactions are entirely trigger-maintained (see
 * migrations/20260709075443_add-driver-wallet-ledger-and-trip-completion.sql)
 * -- this file only ever reads them, never writes.
 */

export interface WalletTransactionRow {
  id: string;
  order_id: string | null;
  type: 'trip_earning' | 'service_fee' | 'withdrawal' | 'adjustment';
  amount: number | string;
  balance_after: number | string;
  created_at: string;
}

export interface DriverWalletSnapshot {
  balance: number;
  transactions: WalletTransactionRow[];
}

/** The logged-in driver's current wallet balance and recent ledger entries. */
export async function fetchDriverWallet(): Promise<DriverWalletSnapshot | null> {
  const { data: authData, error: authError } = await insforge.auth.getCurrentUser();
  if (authError || !authData?.user?.id) return null;

  const { data: driver, error: driverError } = await insforge.database
    .from('drivers')
    .select('wallet_balance')
    .eq('auth_id', authData.user.id)
    .maybeSingle<{ wallet_balance: number | string }>();

  if (driverError || !driver) return null;

  const { data: transactions, error: txError } = await insforge.database
    .from('wallet_transactions')
    .select('id, order_id, type, amount, balance_after, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<WalletTransactionRow[]>();

  return {
    balance: Number(driver.wallet_balance) || 0,
    transactions: txError || !transactions ? [] : transactions,
  };
}
