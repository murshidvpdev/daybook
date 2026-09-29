import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'
import { adminApi } from './adminApi'
import type { AdminStats, AdminUserListItem } from '../types/api'

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  )
}

export function AdminDashboard() {
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await adminApi.get<AdminStats>('/stats')).data,
  })
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await adminApi.get<AdminUserListItem[]>('/users')).data,
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Overview</h1>
        {!loadingStats && stats && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Total users" value={stats.total_users} />
            <StatTile label="New today" value={stats.new_users_today} />
            <StatTile label="New this week" value={stats.new_users_this_week} />
            <StatTile label="Active today" value={stats.active_users_today} />
            <StatTile label="Active this week" value={stats.active_users_this_week} />
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Users</h2>
        {loadingUsers && <p className="text-sm text-neutral-500">Loading…</p>}
        {!loadingUsers && users && users.length === 0 && (
          <p className="text-sm text-neutral-500">No users yet.</p>
        )}
        {!loadingUsers && users && users.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Joined</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Transactions</th>
                  <th className="px-4 py-2 text-right font-medium">Routines</th>
                  <th className="px-4 py-2 text-right font-medium">Habits</th>
                  <th className="px-4 py-2 text-right font-medium">Workouts</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-900">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${u.id}`} className="font-medium text-white hover:underline">
                        {u.email}
                      </Link>
                      {u.display_name && <span className="ml-2 text-neutral-500">{u.display_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{format(parseISO(u.created_at), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        {!u.is_active && (
                          <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-400">
                            Disabled
                          </span>
                        )}
                        {u.active_today && (
                          <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-400">
                            Active today
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{u.transactions_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{u.routines_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{u.habits_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{u.workouts_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
