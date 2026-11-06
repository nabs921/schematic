'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUp } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUp, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-100">Create account</h1>
          <p className="text-sm text-zinc-500 mt-1">Create your Schematic account.</p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/50 text-red-300 text-xs">
                {state.error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="name" className="text-xs font-medium text-zinc-300">
                Full name
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Ada Lovelace"
                required
                autoComplete="name"
                className="bg-zinc-950/60 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-zinc-300">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="bg-zinc-950/60 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-zinc-300">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
                className="bg-zinc-950/60 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-500"
              />
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-2 rounded-lg"
            >
              {isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-800/60 text-center">
            <p className="text-xs text-zinc-500">
              Already have an account?{' '}
              <Link href="/login" className="text-zinc-400 hover:text-zinc-300 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
