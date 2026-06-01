/**
 * send-push Edge Function
 *
 * Triggered by a Postgres pg_net webhook when a row is inserted into `notifications`.
 * Looks up the recipient's Expo push token and sends the notification via Expo Push API.
 * Respects the recipient's notification_preferences stored in their profile.
 *
 * Environment variables (set in Supabase dashboard → Edge Functions → send-push → Secrets):
 *   WEBHOOK_SECRET  — shared secret set in the DB trigger to verify origin
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificationRow {
  id: string;
  user_id: string;
  type: 'like' | 'comment' | 'friend_request' | 'follow';
  actor_id: string;
  cry_id: string | null;
  reference_id: string | null;
  created_at: string;
}

/** Maps notification type → notification_preferences key */
const PREF_KEY: Record<string, string> = {
  like:           'new_likes',
  comment:        'new_comments',
  follow:         'new_followers',
  friend_request: 'friend_requests',
};

Deno.serve(async (req: Request) => {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  if (webhookSecret) {
    const incoming = req.headers.get('x-webhook-secret');
    if (incoming !== webhookSecret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let body: { record?: NotificationRow; new?: NotificationRow };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // pg_net sends the raw row as JSON; Supabase DB webhooks wrap it in { record, ... }
  const row: NotificationRow | undefined = body.record ?? body.new ?? (body as any);
  if (!row?.user_id || !row?.type) {
    return new Response('Missing payload fields', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  // ── Fetch recipient's push token + notification preferences ────────────────
  const { data: recipient } = await supabase
    .from('profiles')
    .select('push_token, notification_preferences')
    .eq('id', row.user_id)
    .single();

  if (!recipient?.push_token) {
    // No token → user hasn't granted permission; nothing to send
    return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Check notification preferences ────────────────────────────────────────
  const prefs: Record<string, boolean> = recipient.notification_preferences ?? {};
  const prefKey = PREF_KEY[row.type];
  if (prefKey && prefs[prefKey] === false) {
    // User has explicitly disabled this notification type
    console.log(`[send-push] skipped — user ${row.user_id} disabled ${prefKey}`);
    return new Response(
      JSON.stringify({ sent: false, reason: 'pref_disabled', pref: prefKey }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── Fetch actor's display name ──────────────────────────────────────────────
  const { data: actor } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', row.actor_id)
    .single();

  const actorName = actor?.display_name ?? actor?.username ?? 'Someone';

  // ── Build notification copy ─────────────────────────────────────────────────
  let title = 'Teardrop';
  let body_text = '';

  switch (row.type) {
    case 'like':
      title = `${actorName} liked your cry 💧`;
      body_text = 'Tap to see your cry';
      break;
    case 'comment':
      title = `${actorName} commented 💬`;
      // Fetch comment content if available
      if (row.reference_id) {
        const { data: comment } = await supabase
          .from('comments')
          .select('content')
          .eq('id', row.reference_id)
          .single();
        body_text = comment?.content ?? 'Tap to see the comment';
      } else {
        body_text = 'Tap to see the comment';
      }
      break;
    case 'follow':
      title = `${actorName} started following you 👤`;
      body_text = 'Tap to see their profile';
      break;
    case 'friend_request':
      title = `${actorName} sent you a friend request`;
      body_text = 'Tap to respond';
      break;
    default:
      title = `New notification from ${actorName}`;
      body_text = 'Tap to open Teardrop';
  }

  // ── Build deep-link data ────────────────────────────────────────────────────
  const data: Record<string, string> = { type: row.type };
  if (row.cry_id) data.cry_id = row.cry_id;
  if (row.actor_id) data.actor_id = row.actor_id;

  // ── Send via Expo Push API ──────────────────────────────────────────────────
  const message = {
    to: recipient.push_token,
    title,
    body: body_text,
    data,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  };

  const expoRes = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(message),
  });

  const expoData = await expoRes.json();
  console.log('[send-push] Expo response:', JSON.stringify(expoData));

  return new Response(JSON.stringify({ sent: true, expo: expoData }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
