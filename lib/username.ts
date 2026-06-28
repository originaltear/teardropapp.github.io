/**
 * lib/username.ts — shared username validation, availability check and update.
 *
 * Used by the profile-setup screen and the Settings "change username" flow so
 * the rules stay in one place.
 */

import { supabase } from './supabase';

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

/** Returns an error message for an invalid username, or null if it's valid. */
export function validateUsername(u: string): string | null {
  if (u.length < 3) return 'Minimum 3 characters';
  if (u.length > 20) return 'Maximum 20 characters';
  if (!USERNAME_REGEX.test(u)) return 'Only lowercase letters, numbers and _';
  return null;
}

/** True if the username is already taken by another account. */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_taken', { uname: username.toLowerCase().trim() });
  if (error) throw error;
  return !!data;
}

/**
 * Update the signed-in user's username.
 * Returns null on success, or a user-facing error message on failure.
 */
export async function updateUsername(username: string): Promise<string | null> {
  const clean = username.toLowerCase().trim();
  const invalid = validateUsername(clean);
  if (invalid) return invalid;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'Not logged in.';

  const { error } = await supabase
    .from('profiles')
    .update({ username: clean })
    .eq('id', session.user.id);

  if (error) {
    if (error.code === '23505') return 'That username was just taken — try another.';
    return error.message;
  }
  return null;
}
