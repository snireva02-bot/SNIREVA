import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type Tables } from './supabase';

type Profile = Tables<'profiles'>;
interface AuthCtx {
  session: Session | null;
  ready: boolean;
  profile: Profile | null | undefined;
  profileLoading: boolean;
  refreshProfile: () => Promise<unknown>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  const profileQ = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).single();
      if (error) throw error;
      return data;
    },
  });

  const signOut = async () => {
    if (uid) await supabase.from('profiles').update({ fcm_token: null }).eq('id', uid);
    await supabase.auth.signOut();
    qc.clear();
  };

  return (
    <Ctx.Provider value={{
      session, ready,
      profile: uid ? profileQ.data : null,
      profileLoading: !!uid && profileQ.isPending,
      refreshProfile: () => profileQ.refetch(),
      signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export const isProfileComplete = (p?: Profile | null) =>
  !!p && !!p.full_name && !!p.address && !!p.delivery_platform && !!p.emergency_contact_phone && !!p.consent_at;
