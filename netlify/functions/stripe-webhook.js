const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Payment succeeded — upgrade firm to Pro
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    // client_reference_id is set via URL param by the app; metadata.firm_id is legacy fallback
    const firmId = session.client_reference_id || session.metadata?.firm_id;
    const customerEmail = session.customer_details?.email;

    if (firmId) {
      // Upgrade by firm_id (most reliable)
      const { error } = await supabase
        .from('firms')
        .update({ plan: 'pro', stripe_customer_id: session.customer })
        .eq('id', firmId);

      if (error) {
        console.error('Supabase update error (firm_id):', error);
        return { statusCode: 500, body: 'Database update failed' };
      }
      console.log(`Upgraded firm ${firmId} to Pro`);
    } else if (customerEmail) {
      // Fallback: match by owner email
      const { data: profile, error: profileError } = await supabase
        .from('auth.users')
        .select('id')
        .eq('email', customerEmail)
        .maybeSingle();

      if (!profileError && profile) {
        const { data: member } = await supabase
          .from('firm_members')
          .select('firm_id')
          .eq('user_id', profile.id)
          .eq('role', 'owner')
          .maybeSingle();

        if (member?.firm_id) {
          await supabase
            .from('firms')
            .update({ plan: 'pro', stripe_customer_id: session.customer })
            .eq('id', member.firm_id);
          console.log(`Upgraded firm ${member.firm_id} to Pro via email match`);
        }
      }
    }
  }

  // Subscription cancelled — downgrade back to free
  if (stripeEvent.type === 'customer.subscription.deleted') {
    const subscription = stripeEvent.data.object;
    const customerId = subscription.customer;

    const { error } = await supabase
      .from('firms')
      .update({ plan: 'free' })
      .eq('stripe_customer_id', customerId);

    if (error) {
      console.error('Supabase downgrade error:', error);
      return { statusCode: 500, body: 'Database update failed' };
    }
    console.log(`Downgraded firm with customer ${customerId} to free`);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
