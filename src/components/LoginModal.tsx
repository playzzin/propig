'use client';

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import { authFormSchema, type AuthFormValues } from '@/schemas/authSchema';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');

  const {
    loginWithEmail,
    loginWithGoogle,
    signUpWithEmail,
    sendPasswordReset,
    isConfigured,
    error: configError,
  } = useAuth();

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    reset,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onBlur',
  });

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
    if (isOpen) {
      setIsAnimating(true);
      return;
    }

    reset();
    setError('');
    setInfo('');
    setLoading(false);
    setIsGoogleLoading(false);
    setShowPassword(false);
    setIsAnimating(false);
    setMode('sign_in');
  }, [isOpen, reset]);

  const handleEmailLogin = handleSubmit(async ({ email, password }) => {
    setError('');
    setInfo('');

    if (!isConfigured) {
      setError(configError ?? 'Firebase가 설정되지 않았습니다.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'sign_up') {
        await signUpWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }

      setTimeout(() => {
        setLoading(false);
        handleClose();
      }, 500);
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, mode === 'sign_up' ? '회원가입에 실패했습니다.' : '로그인에 실패했습니다.'),
      );
      setLoading(false);
    }
  });

  const handleGoogleLogin = async () => {
    setError('');
    setInfo('');

    if (!isConfigured) {
      setError(configError ?? 'Firebase가 설정되지 않았습니다.');
      return;
    }

    setIsGoogleLoading(true);

    try {
      await loginWithGoogle();
      setTimeout(() => {
        setIsGoogleLoading(false);
        handleClose();
      }, 500);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Google 로그인에 실패했습니다.'));
      setIsGoogleLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setInfo('');

    if (!isConfigured) {
      setError(configError ?? 'Firebase가 설정되지 않았습니다.');
      return;
    }

    const isEmailValid = await trigger('email');
    if (!isEmailValid) {
      return;
    }

    setLoading(true);

    try {
      await sendPasswordReset(getValues('email'));
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

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 200);
  };

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return ReactDOM.createPortal(
    <div
      className={`auth-modal-overlay ${isAnimating ? 'open' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'sign_up' ? '회원가입' : '로그인'}
    >
      <div className="auth-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="auth-modal-header">
          <div>
            <div className="auth-modal-title">{mode === 'sign_up' ? '계정 만들기' : '로그인'}</div>
            <div className="auth-modal-subtitle">
              이메일과 비밀번호 또는 Google 계정으로 계속할 수 있습니다.
            </div>
          </div>
          <button type="button" className="auth-modal-close" onClick={handleClose} aria-label="닫기">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="auth-modal-body">
          {info ? (
            <div className="auth-alert info" style={{ marginBottom: 12 }}>
              <i className="fa-solid fa-circle-info" style={{ marginTop: 2 }} />
              <div>{info}</div>
            </div>
          ) : null}

          {error ? (
            <div className="auth-alert error" style={{ marginBottom: 12 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: 2 }} />
              <div>{error}</div>
            </div>
          ) : null}

          <form onSubmit={handleEmailLogin} className="auth-form">
            <div className="auth-field">
              <label htmlFor="email" className="auth-label">
                이메일
              </label>
              <input
                type="email"
                id="email"
                className="auth-input"
                placeholder="name@example.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email?.message ? <div className="auth-alert error">{errors.email.message}</div> : null}
            </div>

            <div className="auth-field">
              <label htmlFor="password" className="auth-label">
                비밀번호
              </label>
              <div className="auth-password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  className="auth-input"
                  placeholder="비밀번호를 입력해 주세요"
                  autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="auth-icon-btn"
                  title={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  <i className={showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'} />
                </button>
              </div>
              {errors.password?.message ? (
                <div className="auth-alert error">{errors.password.message}</div>
              ) : null}
            </div>

            <div className="auth-row">
              <button type="button" className="auth-link" onClick={handlePasswordReset} disabled={loading}>
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
                disabled={loading}
              >
                {mode === 'sign_in' ? '계정 만들기' : '로그인으로'}
              </button>
            </div>

            <button type="submit" disabled={loading} className="auth-primary-btn">
              {loading
                ? mode === 'sign_up'
                  ? '계정 생성 중...'
                  : '로그인 중...'
                : mode === 'sign_up'
                  ? '계정 만들기'
                  : '로그인'}
            </button>
          </form>

          <div className="auth-divider">또는</div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading}
            className="auth-secondary-btn"
          >
            {isGoogleLoading ? (
              <i className="fa-solid fa-circle-notch fa-spin" />
            ) : (
              <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
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
        </div>
      </div>
    </div>,
    document.body,
  );
};
