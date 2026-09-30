'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMenuContext } from '@/contexts/MenuContext';
import { getRouteSite, getSiteHomePath } from '@/constants/siteHome';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { canAccessSiteMode } from '@/utils/menuAccess';
import { SiteModeSwitcher } from './SiteModeSwitcher';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  return isOpen ? <LoginDialog onClose={onClose} /> : null;
};

const LoginDialog: React.FC<Pick<LoginModalProps, 'onClose'>> = ({ onClose }) => {
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const { currentSite, setCurrentSite, siteData, userRole, siteAccess, permissions, isLoading: accessLoading } = useMenuContext();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedSite, setSelectedSite] = useState(() => getRouteSite(pathname, siteData, currentSite) ?? currentSite);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const alive = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const handleClose = useCallback(() => onCloseRef.current(), []);

  const {
    currentUser,
    loginWithEmail,
    loginWithGoogle,
    signUpWithEmail,
    sendPasswordReset,
    isConfigured,
    error: configError,
  } = useAuth();

  const busy = loading || isGoogleLoading || pendingUserId !== null;
  const availableSites = currentUser && !accessLoading
    ? Object.fromEntries(getSwitchableSiteEntries(siteData).filter(([id]) =>
      canAccessSiteMode(id, siteData, { role: userRole, siteAccess, permissions })))
    : siteData;
  const selectedName = siteData[selectedSite]?.name || '사이트';
  const canEnter = canAccessSiteMode(selectedSite, siteData, { role: userRole, siteAccess, permissions });

  const enterSite = useCallback(() => {
    if (accessLoading) return;
    if (!canAccessSiteMode(selectedSite, siteData, { role: userRole, siteAccess, permissions })) {
      setError('선택한 사이트에 접근 권한이 없습니다. 다른 사이트를 선택해 주세요.');
      return;
    }
    const href = getSiteHomePath(selectedSite, siteData);
    if (href !== pathname && !window.dispatchEvent(new CustomEvent('propig:before-navigation', {
      cancelable: true, detail: { href },
    }))) return;
    setCurrentSite(selectedSite);
    handleClose();
    router.push(href);
  }, [accessLoading, selectedSite, siteData, userRole, siteAccess, permissions, pathname, setCurrentSite, handleClose, router]);

  useEffect(() => {
    if (!pendingUserId || currentUser?.uid !== pendingUserId || accessLoading) return;
    setPendingUserId(null);
    setLoading(false);
    setIsGoogleLoading(false);
    enterSite();
  }, [pendingUserId, currentUser?.uid, accessLoading, enterSite]);

  const validateEmail = (value: string) => {
    if (!value.trim()) return '이메일을 입력해 주세요.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return '올바른 이메일 형식이 아닙니다.';
    return '';
  };

  const validatePassword = (value: string) => {
    if (!value) return '비밀번호를 입력해 주세요.';
    if (value.length < 6) return '비밀번호는 최소 6자 이상이어야 합니다.';
    return '';
  };

  const validateCredentials = () => {
    const nextErrors = {
      email: validateEmail(email) || undefined,
      password: validatePassword(password) || undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.email) panelRef.current?.querySelector<HTMLInputElement>('#email')?.focus();
    else if (nextErrors.password) panelRef.current?.querySelector<HTMLInputElement>('#password')?.focus();
    return !nextErrors.email && !nextErrors.password;
  };

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = String((err as { code: unknown }).code);
      switch (code) {
        case 'auth/invalid-email':
          return '이메일 형식이 올바르지 않습니다.';
        case 'auth/user-disabled':
          return '사용 중지된 계정입니다. 관리자에게 문의해 주세요.';
        case 'auth/user-not-found':
          return '등록되지 않은 계정입니다.';
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          return '이메일 또는 비밀번호가 올바르지 않습니다.';
        case 'auth/email-already-in-use':
          return '이미 사용 중인 이메일입니다.';
        case 'auth/weak-password':
          return '비밀번호가 너무 약합니다. 6자 이상으로 설정해 주세요.';
        case 'auth/too-many-requests':
          return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
        case 'auth/popup-closed-by-user':
          return '로그인이 취소되었습니다.';
        case 'auth/cancelled-popup-request':
          return '진행 중인 팝업 요청이 취소되었습니다.';
        case 'auth/account-exists-with-different-credential':
          return '동일 이메일에 다른 로그인 방식 계정이 연결되어 있습니다.';
        default:
          break;
      }
    }

    if (err instanceof Error && err.message) {
      return err.message;
    }

    return fallback;
  };

  useEffect(() => {
    alive.current = true;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('input:checked, button')?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
      }
      if (event.key !== 'Tab') return;
      const tabbableRadio = panelRef.current?.querySelector('input[type="radio"]:checked:not(:disabled)')
        ?? panelRef.current?.querySelector('input[type="radio"]:not(:disabled)');
      const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ) ?? [])].filter((element) => !element.matches(':disabled')
        && (element.getAttribute('type') !== 'radio' || element === tabbableRadio));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [handleClose]);

  const handleEmailLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setInfo('');

    if (!validateCredentials()) return;

    if (!isConfigured) {
      setError(configError ?? 'Firebase가 설정되지 않았습니다.');
      return;
    }

    setLoading(true);

    try {
      const credential = mode === 'sign_up'
        ? await signUpWithEmail(email.trim(), password)
        : await loginWithEmail(email.trim(), password);
      if (alive.current) setPendingUserId(credential.user.uid);
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, mode === 'sign_up' ? '회원가입에 실패했습니다.' : '로그인에 실패했습니다.'),
      );
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (busy) return;
    setError('');
    setInfo('');

    if (!isConfigured) {
      setError(configError ?? 'Firebase가 설정되지 않았습니다.');
      return;
    }

    setIsGoogleLoading(true);

    try {
      const credential = await loginWithGoogle();
      if (alive.current) setPendingUserId(credential.user.uid);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Google 로그인에 실패했습니다.'));
      setIsGoogleLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (busy) return;
    setError('');
    setInfo('');

    if (!isConfigured) {
      setError(configError ?? 'Firebase가 설정되지 않았습니다.');
      return;
    }

    const emailError = validateEmail(email);
    setFieldErrors((current) => ({ ...current, email: emailError || undefined }));
    if (emailError) {
      return;
    }

    setLoading(true);

    try {
      await sendPasswordReset(email.trim());
      setInfo('비밀번호 재설정 이메일을 보냈습니다. 메일함을 확인해 주세요.');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '비밀번호 재설정 이메일 전송에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return ReactDOM.createPortal(
    <div
      className="auth-modal-overlay open"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={currentUser ? '사이트 선택' : mode === 'sign_up' ? '회원가입' : '로그인'}
    >
      <div ref={panelRef} className="auth-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="auth-modal-header">
          <div>
            <div className="auth-modal-title">{currentUser ? '사이트 선택' : mode === 'sign_up' ? '계정 만들기' : '로그인'}</div>
            <div className="auth-modal-subtitle">
              {currentUser ? '로그인한 계정으로 이용할 사이트를 선택하세요.' : '사이트를 선택하고 계정으로 계속하세요.'}
            </div>
          </div>
          <button type="button" className="auth-modal-close" onClick={handleClose} aria-label="닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="auth-modal-body">
          <SiteModeSwitcher sites={availableSites} selectedSite={selectedSite} disabled={busy || accessLoading}
            onSelect={(siteId) => { setSelectedSite(siteId); setError(''); }} />
          {accessLoading || pendingUserId ? <p className="auth-site-hint" role="status">사이트 접근 권한을 확인하고 있습니다.</p> : null}
          {currentUser && !accessLoading && !canEnter && !error ? <p className="auth-site-hint" role="status">선택한 사이트의 접근 권한이 없습니다. 이용 가능한 사이트를 선택해 주세요.</p> : null}
          {info ? (
            <div className="auth-alert info" role="status" style={{ marginBottom: 12 }}>
              <Info size={16} aria-hidden="true" />
              <div>{info}</div>
            </div>
          ) : null}

          {error ? (
            <div className="auth-alert error" role="alert" style={{ marginBottom: 12 }}>
              <TriangleAlert size={16} aria-hidden="true" />
              <div>{error}</div>
            </div>
          ) : null}

          {currentUser ? (
            <button type="button" className="auth-primary-btn" disabled={busy || accessLoading || !canEnter} onClick={enterSite}>
              {selectedName}로 이동
            </button>
          ) : (<>
          {!isConfigured ? <p className="auth-site-hint" role="status">지금은 로그인할 수 없습니다. 공개 사이트는 둘러볼 수 있습니다.</p> : null}
          <form onSubmit={handleEmailLogin} className="auth-form">
            <div className="auth-field">
              <label htmlFor="email" className="auth-label">
                이메일
              </label>
              <input
                type="email"
                id="email"
                name="email"
                spellCheck={false}
                className="auth-input"
                placeholder="name@example.com"
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((current) => ({ ...current, email: undefined }));
                  }
                }}
                onBlur={(event) => {
                  if (event.relatedTarget instanceof HTMLButtonElement) return;
                  const emailError = validateEmail(email);
                  setFieldErrors((current) => ({ ...current, email: emailError || undefined }));
                }}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              />
              {fieldErrors.email ? <div id="login-email-error" className="auth-alert error" role="alert">{fieldErrors.email}</div> : null}
            </div>

            <div className="auth-field">
              <label htmlFor="password" className="auth-label">
                비밀번호
              </label>
              <div className="auth-password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  className="auth-input"
                  placeholder="비밀번호를 입력해 주세요"
                  autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
                  value={password}
                  disabled={busy}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                    }
                  }}
                  onBlur={(event) => {
                    if (event.relatedTarget instanceof HTMLButtonElement) return;
                    const passwordError = validatePassword(password);
                    setFieldErrors((current) => ({ ...current, password: passwordError || undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="auth-icon-btn"
                  title={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              {fieldErrors.password ? (
                <div id="login-password-error" className="auth-alert error" role="alert">{fieldErrors.password}</div>
              ) : null}
            </div>

            <div className="auth-row">
              <button type="button" className="auth-link" onClick={handlePasswordReset} disabled={busy || !isConfigured}>
                비밀번호 재설정
              </button>

              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setError('');
                  setInfo('');
                  setMode((prev) => (prev === 'sign_in' ? 'sign_up' : 'sign_in'));
                }}
                disabled={busy}
              >
                {mode === 'sign_in' ? '계정 만들기' : '로그인으로'}
              </button>
            </div>

            <button type="submit" disabled={busy || accessLoading || !isConfigured || !siteData[selectedSite]} className="auth-primary-btn">
              {loading
                ? mode === 'sign_up'
                  ? '계정 생성 중...'
                  : '로그인 중...'
                : mode === 'sign_up'
                  ? '계정 만들기'
                  : `${selectedName}에 로그인`}
            </button>
          </form>

          <div className="auth-divider">또는</div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy || accessLoading || !isConfigured || !siteData[selectedSite]}
            className="auth-secondary-btn"
          >
            {isGoogleLoading ? (
              <LoaderCircle size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Google로 계속하기
          </button>
          {canEnter ? (
            <button type="button" className="auth-guest-link" disabled={busy || accessLoading} onClick={enterSite}>
              로그인 없이 {selectedName} 둘러보기 <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : <p className="auth-site-hint">로그인 후 선택한 사이트의 접근 권한을 확인합니다.</p>}
          </>)}
        </div>
      </div>
    </div>,
    document.body,
  );
};
