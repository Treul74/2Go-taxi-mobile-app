import { insforge } from '@/lib/insforge';
import { fetchCustomerAccount } from './accounts';

/**
 * Post-trip customer -> driver ratings.
 *
 * One rating per completed order (ratings.order_id is UNIQUE) -- an insert
 * recomputes the driver's rating/total_ratings average via a trigger, see
 * migrations/20260709075617_add-ratings-and-driver-rating-aggregate.sql.
 * Rating is optional; skipping it means no row is ever inserted.
 */
export async function submitRating(
  orderId: string,
  driverId: string,
  rating: number,
  comment?: string
): Promise<string | null> {
  const customer = await fetchCustomerAccount();
  if (!customer) return 'You need to be signed in to rate this trip.';

  const { error } = await insforge.database.from('ratings').insert([
    {
      order_id: orderId,
      customer_id: customer.id,
      driver_id: driverId,
      rating,
      comment: comment || null,
    },
  ]);

  return error ? error.message : null;
}
