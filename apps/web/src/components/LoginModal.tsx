import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { verifyAdmin } from '../services';
import { useTrackerAuth } from '../contexts/TrackerContext';

interface Props {
  onClose: () => void;
}

export function LoginModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { login } = useTrackerAuth();
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
      setPassword('');
      login(password);
      onClose();
    } else {
      setError(t('login.invalidPassword'));
      setPassword('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-gray-900 border border-gray-700 rounded-lg z-50 p-6 shadow-2xl">
        <h2 className="text-white text-base font-semibold mb-4">{t('login.title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('login.placeholder')}
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
              {t(loading ? 'login.verifying' : 'login.submit')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md border border-gray-700 transition-colors cursor-pointer"
            >
              {t('login.cancel')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
