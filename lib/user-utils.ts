// lib/user-utils.ts
import { supabase } from './supabase';

/**
 * Get internal UUID from Clerk ID
 */
export async function getInternalUserId(clerkId: string): Promise<string | null> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    if (error || !user) {
      console.error('Error finding user:', error);
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('Error in getInternalUserId:', error);
    return null;
  }
}