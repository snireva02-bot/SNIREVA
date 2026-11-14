import { useQuery } from '@tanstack/react-query'
import { supabase, type Tables } from './supabase'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Tables<'settings'>> => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()
      if (error) throw error
      return data
    },
  })
}
