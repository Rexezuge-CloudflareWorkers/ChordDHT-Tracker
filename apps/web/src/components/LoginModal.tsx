import React, { useState } from 'react';
import { verifyAdmin } from '../api';

interface Props {
  onSuccess: (token: string) => void;
  onClose: () => void;
}

export function LoginModal({ onSuccess, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await verifyAdmin(password);
    setLoading(false);
    if (ok) {
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('adminToken', token);
      setPassword('');
      onSuccess(token);
    } else {
      setError('Invalid password');
      setPassword('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-gray-900 border border-gray-700 rounded-lg z-50 p-6 shadow-2xl">
        <h2 className="text-white text-base font-semibold mb-4">Admin Login</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md transition-colors cursor-pointer"
            >
              {loading ? 'Verifying…' : 'Log in'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md border border-gray-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
