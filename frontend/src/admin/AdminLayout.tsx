import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAdminAuth } from './AdminAuthContext'

export function AdminLayout() {
  const { logout } = useAdminAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
        <Link to="/admin" className="text-sm font-semibold tracking-wide text-white">
          Daybook Admin
        </Link>
        <button
          onClick={() => {
            logout()
            navigate('/admin/login')
          }}
          className="text-sm text-neutral-400 hover:text-white"
        >
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
