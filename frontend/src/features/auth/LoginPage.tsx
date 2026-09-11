import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../../auth/AuthContext'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      await login(values.email, values.password)
      navigate('/')
    } catch {
      setServerError('Incorrect email or password.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-3xl">📔</div>
          <h1 className="text-2xl">Daybook</h1>
          <p className="text-sm text-[var(--ink-soft)]">One ledger for routine, health, and money.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              autoComplete="email"
              {...register('email')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2.5 text-base outline-none focus:border-[var(--accent)]"
            />
            {errors.email && <p className="mt-1 text-xs text-[var(--danger)]">{errors.email.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2.5 text-base outline-none focus:border-[var(--accent)]"
            />
            {errors.password && <p className="mt-1 text-xs text-[var(--danger)]">{errors.password.message}</p>}
          </div>
          {serverError && <p className="text-sm text-[var(--danger)]">{serverError}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--ink-soft)]">
          New here?{' '}
          <Link to="/register" className="font-medium text-[var(--accent-ink)]">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
