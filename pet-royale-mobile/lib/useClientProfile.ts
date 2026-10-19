import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import { DEFAULT_ISO, parsePhone } from './phone';

export const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');

/**
 * Loads the signed-in user's personal details, reloading every time the
 * screen is focused (so coming back from an edit screen shows the change).
 *
 * clients.name is one string, so first_name / last_name are also kept in
 * auth metadata and used whenever they agree with clients.name. If they
 * don't (the clinic edited the name, or an older account), clients.name
 * wins and is split on the first space.
 *
 * Address and Messenger work the same way: clients.address and
 * clients.fb_messenger win, and the values saved at sign-up (auth metadata)
 * fill in when the clients row has none. They are read in their own query,
 * so if those columns are ever missing, name and phone still load.
 */
export function useClientProfile() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_ISO);
  const [national, setNational] = useState('');
  const [address, setAddress] = useState('');
  const [messenger, setMessenger] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (active) setIsLoading(false);
          return;
        }

        const { data: client } = await (supabase as any)
          .from('clients')
          .select('name, phone')
          .eq('id', user.id)
          .maybeSingle();

        const { data: extra } = await (supabase as any)
          .from('clients')
          .select('address, fb_messenger')
          .eq('id', user.id)
          .maybeSingle();

        if (!active) return;

        const meta = user.user_metadata || {};
        const metaFirst = tidy(meta.first_name || '');
        const metaLast = tidy(meta.last_name || '');
        const metaFull = [metaFirst, metaLast].filter(Boolean).join(' ');
        const clientName = tidy(client?.name || '');

        let fn: string;
        let ln: string;
        if (metaFirst && (!clientName || clientName === metaFull)) {
          fn = metaFirst;
          ln = metaLast;
        } else {
          const full = clientName || tidy(meta.full_name || '');
          const parts = full.split(' ').filter(Boolean);
          fn = parts[0] || '';
          ln = parts.slice(1).join(' ');
        }

        const parsed = parsePhone(client?.phone);
        setUser(user);
        setIsVerified(!!user.email_confirmed_at);
        setAvatarUrl(meta.avatar_url || meta.picture || null);
        setFirstName(fn);
        setLastName(ln);
        setCountryIso(parsed.iso);
        setNational(parsed.national);
        setAddress(tidy(extra?.address || meta.address || ''));
        setMessenger(tidy(extra?.fb_messenger || meta.fb_messenger || ''));
        setIsLoading(false);
      })();

      return () => { active = false; };
    }, [])
  );

  return {
    user, isLoading, firstName, lastName, countryIso, national,
    address, messenger, avatarUrl, isVerified,
  };
}