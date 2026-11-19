import { appPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const setup = !appPassword();
  return (
    <div className="public">
      <header className="public-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/plasgain-logo.png" alt="Plasgain" />
      </header>
      <main className="public-main narrow">
        <div className="card">
          <h1>Staff sign in</h1>
          {setup ? (
            <p className="notice bad">
              Sign-in isn&apos;t set up yet. Add an <strong>APP_PASSWORD</strong> setting (at least 8 characters) to this
              app&apos;s Vercel project, then redeploy.
            </p>
          ) : (
            <form method="post" action="/api/login" className="login-form">
              <input type="hidden" name="next" value={next ?? '/'} />
              <label>
                Password
                <input type="password" name="password" autoComplete="current-password" autoFocus required />
              </label>
              {error === 'wrong' && <p className="bad small">That password isn&apos;t right.</p>}
              <button type="submit">Sign in</button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
