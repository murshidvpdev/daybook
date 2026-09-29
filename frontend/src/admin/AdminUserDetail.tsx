import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from './adminApi'
import type { AdminUserDetail as AdminUserDetailType } from '../types/api'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-800 bg-neutral-900 p-4 ${className}`}>{children}</div>
  )
}

export function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [newPassword, setNewPassword] = useState('')
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: async () => (await adminApi.get<AdminUserDetailType>(`/users/${userId}`)).data,
  })

  const resetPassword = useMutation({
    mutationFn: async () => adminApi.post(`/users/${userId}/reset-password`, { new_password: newPassword }),
    onSuccess: () => {
      setResetMessage('Password reset. Every existing session for this user was signed out.')
      setNewPassword('')
    },
    onError: () => setResetMessage("Couldn't reset — password must be at least 8 characters."),
  })

  const setActive = useMutation({
    mutationFn: async (is_active: boolean) => adminApi.post(`/users/${userId}/active`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })

  const deleteUser = useMutation({
    mutationFn: async () => adminApi.delete(`/users/${userId}`),
    onSuccess: () => navigate('/admin'),
  })

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (!user) return <p className="text-sm text-neutral-500">User not found.</p>

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/admin" className="text-sm text-neutral-500 hover:text-white">
          ← All users
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">{user.email}</h1>
            <p className="text-sm text-neutral-500">
              {user.display_name || 'No display name'} · Joined {format(parseISO(user.created_at), 'MMM d, yyyy')}
            </p>
          </div>
          {!user.is_active && (
            <span className="rounded-full bg-red-900/40 px-3 py-1 text-xs text-red-400">Account disabled</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Finance</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-neutral-500">Total balance</dt>
            <dd className="text-right tabular-nums text-white">₹{Number(user.finance.total_balance).toLocaleString('en-IN')}</dd>
            <dt className="text-neutral-500">Net worth</dt>
            <dd className="text-right tabular-nums text-white">₹{Number(user.finance.net_worth).toLocaleString('en-IN')}</dd>
            <dt className="text-neutral-500">Spent this month</dt>
            <dd className="text-right tabular-nums text-white">₹{Number(user.finance.spent_this_month).toLocaleString('en-IN')}</dd>
            <dt className="text-neutral-500">Income this month</dt>
            <dd className="text-right tabular-nums text-white">₹{Number(user.finance.income_this_month).toLocaleString('en-IN')}</dd>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Account actions</h2>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="New password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-neutral-500"
              />
              <button
                onClick={() => resetPassword.mutate()}
                disabled={newPassword.length < 8 || resetPassword.isPending}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40"
              >
                Reset password
              </button>
            </div>
            {resetMessage && <p className="text-xs text-neutral-400">{resetMessage}</p>}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setActive.mutate(!user.is_active)}
                disabled={setActive.isPending}
                className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                {user.is_active ? 'Disable account' : 'Re-enable account'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Permanently delete ${user.email} and all their data? This can't be undone.`)) {
                    deleteUser.mutate()
                  }
                }}
                disabled={deleteUser.isPending}
                className="rounded-lg border border-red-900 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-950"
              >
                Delete user
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Recent transactions
          </h2>
          {user.recent_transactions.length === 0 && <p className="text-sm text-neutral-500">None yet.</p>}
          <ul className="flex flex-col gap-1.5 text-sm">
            {user.recent_transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between border-b border-neutral-800 py-1.5 last:border-0">
                <span className="text-neutral-300">{t.note || (t.kind === 'expense' ? 'Expense' : 'Income')}</span>
                <span className={t.kind === 'expense' ? 'text-red-400' : 'text-emerald-400'}>
                  {t.kind === 'expense' ? '−' : '+'}₹{Number(t.amount).toLocaleString('en-IN')}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Routines & habits</h2>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-600">Routines</p>
          {user.routines.length === 0 && <p className="mb-2 text-sm text-neutral-500">None yet.</p>}
          <ul className="mb-3 flex flex-col gap-1 text-sm text-neutral-300">
            {user.routines.map((r) => (
              <li key={r.id}>
                {r.name} <span className="text-neutral-600">({r.time_of_day}, {r.item_count} items)</span>
              </li>
            ))}
          </ul>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-600">Habits</p>
          {user.habits.length === 0 && <p className="text-sm text-neutral-500">None yet.</p>}
          <ul className="flex flex-col gap-1 text-sm text-neutral-300">
            {user.habits.map((h) => (
              <li key={h.id}>
                {h.name} <span className="text-neutral-600">({h.cadence}{h.is_archived ? ', archived' : ''})</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent workouts</h2>
        {user.recent_workouts.length === 0 && <p className="text-sm text-neutral-500">None yet.</p>}
        <ul className="flex flex-col gap-1 text-sm text-neutral-300">
          {user.recent_workouts.map((w) => (
            <li key={w.id} className="flex justify-between border-b border-neutral-800 py-1 last:border-0">
              <span>{w.name}</span>
              <span className="text-neutral-500">
                {format(parseISO(w.performed_on), 'MMM d')}
                {w.duration_minutes ? ` · ${w.duration_minutes} min` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
