import React, { useState } from 'react';
import type { User, Role } from '../types';
import { session } from '../services/http';

interface LoginProps {
  onLogin: (user: User) => void;
}

interface AuthApiResponse {
  token?: string;
  user?: {
    id?: string | number;
    user_id?: string | number;
    name?: string;
    full_name?: string;
    email?: string;
    role?: string;
  };
  error?: {
    message?: string;
  };
}

export default function Login({ onLogin }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'citizen' | 'staff'>('citizen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isSignUp
        ? (role === 'staff' ? '/api/v1/auth/register-staff' : '/api/v1/auth/register')
        : '/api/v1/auth/login';

      const payload = isSignUp
        ? { fullName: fullName.trim(), email: email.trim(), password, role: role === 'staff' ? 'Staff' : 'Citizen' }
        : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: AuthApiResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Authentication failed. Please check your credentials.');
      }

      if (data.token) {
        // Save the JWT using the session helper
        if (typeof (session as any).setToken === 'function') {
          (session as any).setToken(data.token);
        } else {
          localStorage.setItem('token', data.token);
        }

        // Normalize the user payload to match your app's User type
        const rawRole = (data.user?.role || role).toLowerCase();
        const normalizedRole: Role =
          rawRole === 'staff' ? 'Staff' :
          rawRole === 'supervisor' ? 'Supervisor' :
          rawRole === 'admin' ? 'Admin' : 'Citizen';

        const safeUser: User = {
          id: String(data.user?.id || data.user?.user_id || ''),
          name: data.user?.name || data.user?.full_name || fullName || 'User',
          email: data.user?.email || email,
          role: normalizedRole,
        } as User;

        // Save and trigger state transition in App.tsx
        session.setUser(safeUser);
        onLogin(safeUser);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={styles.title}>{isSignUp ? 'Create an Account' : 'Welcome Back'}</h2>
          <p style={styles.subtitle}>
            {isSignUp
              ? 'Register to submit requests or manage tickets'
              : 'Sign in to access your CivicConnect portal'}
          </p>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {isSignUp && (
            <div style={styles.formGroup}>
              <label htmlFor="fullName" style={styles.label}>Full Name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                required
                style={styles.input}
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label htmlFor="email" style={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@civicconnect.gov.za"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="password" style={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
            />
          </div>

          {isSignUp && (
            <div style={styles.formGroup}>
              <label htmlFor="role" style={styles.label}>Account Type</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'citizen' | 'staff')}
                style={styles.input}
              >
                <option value="citizen">Citizen</option>
                <option value="staff">Staff Member</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.submitBtn, ...(loading ? styles.btnDisabled : {}) }}
          >
            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
          </button>
        </form>

        <div style={styles.footer}>
          <span>{isSignUp ? 'Already have an account?' : "Don't have an account yet?"}</span>
          <button type="button" onClick={toggleMode} style={styles.linkBtn}>
            {isSignUp ? 'Sign In' : 'Create an Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '80vh',
    padding: '1.5rem',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
    padding: '2rem',
  },
  header: {
    marginBottom: '1.25rem',
  },
  title: {
    margin: '0 0 0.5rem',
    fontSize: '1.5rem',
    color: '#1a202c',
    fontWeight: 700,
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#718096',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    marginBottom: '0.35rem',
    color: '#2d3748',
  },
  input: {
    padding: '0.65rem 0.85rem',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '0.95rem',
    outline: 'none',
  },
  submitBtn: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  footer: {
    marginTop: '1.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: '#4a5568',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: '0.4rem',
    textDecoration: 'underline',
  },
  errorAlert: {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    backgroundColor: '#fed7d7',
    color: '#9b2c2c',
    border: '1px solid #feb2b2',
  },
};