'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { withBasePath } from '../services';

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get('next') || '/admin', [searchParams]);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const response = await fetch(withBasePath('/api/login'), {
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
          src="https://genetikasolusibisnis.co.id/wp-content/uploads/2022/09/genetika-1-warna.png"
          alt="Genesis"
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
              placeholder="admin123"
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
