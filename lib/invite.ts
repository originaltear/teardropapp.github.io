/**
 * lib/invite.ts — bringing someone in from outside the app.
 *
 * Until now the only route to a friend was searching for someone already here,
 * which meant there was no path at all from an existing user to a new one. A
 * cry is only worth sharing with people who know you, so this is the loop the
 * app actually grows on.
 *
 * The link points at the marketing site rather than at a store listing: it
 * carries badges for both platforms, and the sender has no way of knowing which
 * phone the person on the other end is holding.
 */
import { Share } from 'react-native';
import { supabase } from './supabase';

const SITE_URL = 'https://teardropapp.com';

/** Your own handle, so whoever you invite can find you once they're in. */
async function myUsername(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single();
    return data?.username ?? null;
  } catch {
    return null;   // an invite without a handle is still an invite
  }
}

/**
 * Opens the system share sheet with an invite. Fire-and-forget: dismissing the
 * sheet is the normal case, not an error worth surfacing.
 */
export async function inviteAFriend(): Promise<void> {
  const username = await myUsername();
  const findMe = username ? ` I'm @${username} on there.` : '';

  try {
    await Share.share({
      // The URL sits inside the message on purpose. iOS treats a separate `url`
      // field differently per target app, and some drop it entirely.
      message:
        'I use Teardrop to keep track of the moments that get to me. ' +
        'You log how you felt and it lands on a world map, so you can look back ' +
        `and see where your year actually happened.${findMe}\n\n${SITE_URL}`,
    });
  } catch {
    // Sheet dismissed, or the platform refused to open it. Nothing to say.
  }
}
