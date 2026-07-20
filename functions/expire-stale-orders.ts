import { createAdminClient } from 'npm:@insforge/sdk';

/**
 * Scheduled sweep (see schedules: expire-stale-orders, every minute): flips
 * any order still 'pending' past its expires_at to 'expired' so drivers stop
 * seeing stale/abandoned requests. Invoked only by the schedule, authenticated
 * via the X-Cron-Secret header against CRON_SECRET.
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret');
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const { data, error } = await admin.database
    .from('orders')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ expiredCount: data?.length ?? 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
