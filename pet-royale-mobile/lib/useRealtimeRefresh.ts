import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

export function useRealtimeRefresh(table: string, refetch: () => void, filter?: string) {
  const refetchRef = useRef(refetch);

  // Keep the latest reload function, updated after render (not during it)
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refetchRef.current(), 300);
    };

    // Unique name so two screens listening to the same table don't clash
    const channelName = `rt-${table}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        trigger
      )
      .subscribe();

    // Also refresh when the app comes back from the background
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') trigger();
    });

    return () => {
      clearTimeout(timer);
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [table, filter]);
}