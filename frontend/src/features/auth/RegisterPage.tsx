import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../../auth/AuthContext'

const schema = z.object({
  displayName: z.string().optional(),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
})
type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { register: registerUser } = useAuth()
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
      await registerUser(values.email, values.password, values.displayName)
      navigate('/')
    } catch {
      setServerError('That email is already registered.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-3xl">📔</div>
          <h1 className="text-2xl">Create your Daybook</h1>
          <p className="text-sm text-[var(--ink-soft)]">Your data stays yours — export or delete it any time.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Name (optional)</label>
            <input
              {...register('displayName')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2.5 text-base outline-none focus:border-[var(--accent)]"
            />
          </div>
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
              autoComplete="new-password"
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
            {isSubmitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--ink-soft)]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[var(--accent-ink)]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
