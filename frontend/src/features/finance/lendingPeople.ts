import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { LendingPerson } from '../../types/api'

export function useLendingPeople() {
  return useQuery({
    queryKey: ['finance', 'lendings', 'people'],
    queryFn: async () => (await api.get<LendingPerson[]>('/finance/lendings/people')).data,
  })
}
