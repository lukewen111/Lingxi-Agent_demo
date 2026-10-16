import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconLock, IconUser } from '@arco-design/web-react/icon';
import loginHero from '../assets/login-hero.png';
import { Button, Input, Message, Popover } from '../components/ui';
import { STRONG_PASSWORD_MESSAGE, isStrongPassword } from '../auth';
import { createTranslator, LANGUAGE_LABELS } from '../i18n';
import type { AppLanguage } from '../i18n';
import { useAppStore } from '../store';

interface LoginErrors {
  username?: string;
  password?: string;
  submit?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { state, dispatch, login } = useAppStore();
  const language = state.ui.language;
  const t = createTranslator(language);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const validate = () => {
    const next: LoginErrors = {};
    if (!username.trim()) next.username = t('usernameRequired');
    if (!password) next.password = t('passwordRequired');
    else if (!isStrongPassword(password)) next.password = STRONG_PASSWORD_MESSAGE;
    return next;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const next = validate();
    setErrors(next);
    if (next.username) {
      document.getElementById('login-username')?.focus();
      return;
    }
    if (next.password) {
      document.getElementById('login-password')?.focus();
      return;
    }
    const tenant = state.tenantAccounts.find((item) => item.ownerUsername === username.trim());
    if (tenant && !tenant.enabled) {
      setErrors({ submit: '账号已停用' });
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      login(username);
      setPassword('');
      Message.success(t('loginSuccess'));
      const tenantAccount = state.tenantAccounts.find((item) => item.ownerUsername === username.trim());
      if (tenantAccount?.workspacePermissions.length === 1 && tenantAccount.workspacePermissions[0] === 'livechat') {
        dispatch({ type: 'ui.workspace', workspaceMode: 'livechat' });
        navigate('/livechat/dashboard', { replace: true });
      } else {
        dispatch({ type: 'ui.workspace', workspaceMode: 'agents' });
        navigate('/inbox', { replace: true });
      }
    } catch {
      setErrors({ submit: t('loginSaveFailed') });
    } finally {
      setSubmitting(false);
    }
  };

  const languageMenu = <div className="login-language-menu">
    {(['zh-CN', 'en-US'] as AppLanguage[]).map((item) => <button key={item} type="button" className={language === item ? 'active' : ''} onClick={() => dispatch({ type: 'ui.language', language: item })}>{LANGUAGE_LABELS[item]}</button>)}
  </div>;

  return <main className="login-shell">
    <section className="login-hero" aria-hidden>
      <img src={loginHero} alt="" />
    </section>
    <section className="login-panel" aria-labelledby="login-title">
      <Popover trigger="click" position="bottom" content={languageMenu}>
        <button className="login-language-trigger" type="button"><span aria-hidden="true">◎</span>{LANGUAGE_LABELS[language]}<span aria-hidden="true">⌄</span></button>
      </Popover>
      <form className="login-form" onSubmit={submit} noValidate>
        <div className="login-form-head">
          <div className="login-logo-row"><span>LOGO</span></div>
          <h2 id="login-title">{t('loginTitle')}</h2>
          <p>{t('loginSubtitle')}</p>
        </div>
        <label className={`login-field ${errors.username ? 'has-error' : ''}`}>
          <span>{t('username')}</span>
          <Input id="login-username" value={username} onChange={(value: string) => { setUsername(value); setErrors((prev) => ({ ...prev, username: undefined, submit: undefined })); }} prefix={<IconUser />} placeholder={t('usernamePlaceholder')} size="large" status={errors.username ? 'error' : undefined} autoComplete="username" />
          {errors.username && <small role="alert">{errors.username}</small>}
        </label>
        <label className={`login-field ${errors.password ? 'has-error' : ''}`}>
          <span>{t('password')}</span>
          <Input.Password id="login-password" value={password} onChange={(value: string) => { setPassword(value); setErrors((prev) => ({ ...prev, password: undefined, submit: undefined })); }} prefix={<IconLock />} placeholder={t('passwordPlaceholder')} size="large" status={errors.password ? 'error' : undefined} autoComplete="current-password" />
          {errors.password && <small role="alert">{errors.password}</small>}
        </label>
        {errors.submit && <div className="login-submit-error" role="alert">{errors.submit}</div>}
        <Button className="login-submit" type="primary" htmlType="submit" size="large" loading={submitting} disabled={submitting}>{t('login')}</Button>
      </form>
    </section>
  </main>;
}
