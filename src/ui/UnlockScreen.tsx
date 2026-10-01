import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onVerify: (password: string) => Promise<boolean>;
}

export function UnlockScreen({ onVerify }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checking || !password) return;
    setChecking(true);
    setError(false);
    try {
      const unlocked = await onVerify(password);
      setError(!unlocked);
      if (!unlocked) setPassword('');
    } catch {
      setError(true);
      setPassword('');
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="unlock-screen">
      <form className="unlock-screen__card" onSubmit={(event) => void submit(event)}>
        <h1>{t('lock.title')}</h1>
        <p>{t('lock.warning')}</p>
        <label>
          {t('lock.password')}
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p role="alert">{t('lock.incorrect')}</p>}
        <button className="btn btn--primary" disabled={checking || !password}>
          {checking ? t('lock.checking') : t('lock.unlock')}
        </button>
      </form>
    </main>
  );
}
