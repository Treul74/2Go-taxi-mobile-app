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

/**
 * Post-trip driver -> customer ratings (rated_by='driver').
 *
 * Same one-rating-per-order-per-direction constraint as submitRating, see
 * migrations/20260722150432_add-driver-rates-customer-aggregate.sql for the
 * rated_by column/trigger branch and
 * migrations/20260723000001_add-rating-categories.sql for the category
 * columns. Rating is optional; skipping it means no row is ever inserted.
 */
export async function submitDriverRating(
  orderId: string,
  customerId: string,
  driverId: string,
  rating: number,
  categories: {
    punctuality?: number;
    communication?: number;
    payment?: number;
  },
  comment?: string
): Promise<string | null> {
  const { error } = await insforge.database.from('ratings').insert([
    {
      order_id: orderId,
      customer_id: customerId,
      driver_id: driverId,
      rating,
      punctuality: categories.punctuality || null,
      passenger_communication: categories.communication || null,
      payment: categories.payment || null,
      comment: comment || null,
      rated_by: 'driver',
    },
  ]);

  return error ? error.message : null;
}
