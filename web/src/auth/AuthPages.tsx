import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { InlineNotice } from '../ui/InlineNotice';
import { TextField } from '../ui/TextField';
import { useAuth, useAuthFlow } from './AuthProvider';
import { consumeAuthCallback } from './callback';

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (auth.status === 'authenticated') return <Navigate to="/carteira" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { await auth.signIn(email, password); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  };
  const expired = auth.status === 'expired' || (location.state as { expired?: boolean } | null)?.expired === true;
  return (
    <main className="auth-page"><section className="auth-card" aria-labelledby="login-heading">
      <p className="eyebrow">Motor de Fluxo</p><h1 id="login-heading">Entrar</h1><p>Acesso restrito às pessoas convidadas.</p>
      {expired ? <InlineNotice>Sua sessão expirou. Entre novamente para continuar com o rascunho desta conta.</InlineNotice> : null}
      {auth.status === 'unavailable' ? <InlineNotice tone="error">O serviço de autenticação está indisponível. Tente novamente.</InlineNotice> : null}
      <form aria-label="Formulário de entrada" onSubmit={(event) => void submit(event)}>
        <TextField id="email" label="E-mail" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
        <TextField id="password" label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.currentTarget.value)} {...(error === null ? {} : { error })} />
        <button className="button" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </section></main>
  );
}

export function CallbackPage() {
  const { verifyOtp } = useAuthFlow();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;
      void consumeAuthCallback(window.location.href, (path) => window.history.replaceState(window.history.state, '', path), verifyOtp)
        .then(() => { if (mountedRef.current) navigate('/auth/definir-senha', { replace: true }); })
        .catch((caught: unknown) => { if (mountedRef.current) setError(caught instanceof Error ? caught.message : 'O link é inválido ou expirou.'); });
    }
    return () => { mountedRef.current = false; };
  }, [navigate, verifyOtp]);
  return (
    <main className="auth-page"><section className="auth-card" aria-labelledby="callback-heading">
      <p className="eyebrow">Motor de Fluxo</p><h1 id="callback-heading">Confirmando acesso</h1>
      {error === null ? <InlineNotice busy>Validando o link de acesso…</InlineNotice> : <><InlineNotice tone="error">{error}</InlineNotice><Link className="auth-link" to="/login">Voltar para o login</Link></>}
    </section></main>
  );
}

export function PasswordPage() {
  const auth = useAuth(); const { updatePassword } = useAuthFlow(); const navigate = useNavigate();
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (auth.status === 'loading') return <p className="session-loading" role="status">Verificando sessão…</p>;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { setError('As senhas informadas não coincidem.'); return; }
    setBusy(true); setError(null);
    try { await updatePassword(password); navigate('/carteira', { replace: true }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível definir a senha.'); }
    finally { setBusy(false); }
  };
  return (
    <main className="auth-page"><section className="auth-card" aria-labelledby="password-heading">
      <p className="eyebrow">Primeiro acesso</p><h1 id="password-heading">Definir senha</h1><p>Use pelo menos 12 caracteres. Espaços digitados fazem parte da senha.</p>
      <form aria-label="Definição de senha" onSubmit={(event) => void submit(event)}>
        <TextField id="new-password" label="Nova senha" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
        <TextField id="password-confirmation" label="Confirmar nova senha" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} {...(error === null ? {} : { error })} />
        <button className="button" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Definir senha'}</button>
      </form>
    </section></main>
  );
}
