'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GENESIS_LOGO_URL, withBasePath } from '../services';

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get('next') || '/control', [searchParams]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const response = await fetch(withBasePath('/api/login/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json() as { error?: string };

      if (!response.ok) throw new Error(payload.error || 'Login gagal.');

      window.location.href = withBasePath(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login gagal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-panel">
        <img
          className="brand-image"
          src={GENESIS_LOGO_URL}
          alt="Genesis"
          width={280}
          height={100}
          decoding="async"
        />
        <div>
          <p className="agency">Admin Area</p>
          <h1>Login Admin</h1>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="download-button" disabled={isSubmitting}>
            {isSubmitting ? 'Masuk...' : 'Masuk'}
          </button>
          {message && <p className="login-error">{message}</p>}
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
