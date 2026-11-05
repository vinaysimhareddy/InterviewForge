import React, { useState } from 'react';
import { Shield, Eye, EyeOff, Sparkles, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/common/Logo';
import { formatPageTitle } from '@/copy/glossary';

interface AuthPageProps {
  initialMode?: 'login' | 'register';
}

export default function AuthPage({ initialMode = 'login' }: AuthPageProps): React.ReactElement {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const { login, register, isLoading, error, clearError } = useAuth();

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentChecked, setConsentChecked] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  React.useEffect(() => {
    document.title = formatPageTitle(mode === 'login' ? 'Candidate Sign In' : 'Candidate Registration');
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalValidation(null);

    if (!email || !email.includes('@')) {
      setLocalValidation('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setLocalValidation('Password must be at least 8 characters long.');
      return;
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        setLocalValidation('Please enter your full name.');
        return;
      }
      if (confirmPassword && password !== confirmPassword) {
        setLocalValidation('Passwords do not match.');
        return;
      }
      if (!consentChecked) {
        setLocalValidation('Please accept the interview consent policy to proceed.');
        return;
      }
    }

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, fullName, password);
      }
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const redirect = params?.get('redirect') || '/app/dashboard';
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.href = redirect;
      }
    } catch {
      // Error handled by AuthContext
    }
  };

  const fillDemoCandidate = () => {
    setEmail('candidate.alex@example.com');
    setFullName('Alex Mercer');
    setPassword('InterviewReady2026!');
    setConfirmPassword('InterviewReady2026!');
    setConsentChecked(true);
    setLocalValidation(null);
    clearError();
  };

  return (
    <div className="w-full max-w-md mx-auto my-auto py-6 sm:py-8 px-3 sm:px-4">
      <div className="flex flex-col items-center justify-center mb-6">
        <Logo size="lg" variant="full" href="/" responsive={true} />
      </div>
      <Card className="card-editorial border-card-border bg-card shadow-card">
        <CardHeader className="space-y-4 pb-6">
          <div className="flex items-center justify-between">
            <div className="h-11 w-11 rounded-xl bg-mint flex items-center justify-center text-primary shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <Badge variant="mono">SECURE AUTH</Badge>
          </div>

          <div className="space-y-1">
            <div className="label-mono">01 // CANDIDATE ACCESS</div>
            <CardTitle className="font-display text-2xl sm:text-3xl text-text font-semibold tracking-tight">
              {mode === 'login' ? 'Candidate Sign In' : 'Create Candidate Account'}
            </CardTitle>
            <CardDescription className="text-text-muted text-xs sm:text-sm">
              {mode === 'login'
                ? 'Sign in to access your interview dashboard and practice sessions.'
                : 'Create your account to start voice-based adaptive technical interviews.'}
            </CardDescription>
          </div>

          {/* Toggle pill: Sign in vs Register */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-bg-subtle rounded-lg border border-card-border">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                clearError();
                setLocalValidation(null);
              }}
              className={`py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer min-h-[44px] sm:min-h-0 flex items-center justify-center touch-manipulation ${
                mode === 'login'
                  ? 'bg-card text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                clearError();
                setLocalValidation(null);
              }}
              className={`py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer min-h-[44px] sm:min-h-0 flex items-center justify-center touch-manipulation ${
                mode === 'register'
                  ? 'bg-card text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Register
            </button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || localValidation) && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/25 text-danger text-xs flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{localValidation || error}</span>
              </div>
            )}

            {/* Registration field order: 1. name -> 2. email -> 3. password -> 4. confirm -> 5. consent */}
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-text font-medium">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Mercer"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="w-full px-3.5 py-2.5 rounded-md bg-bg-subtle border border-card-border text-base sm:text-sm text-text placeholder:text-text-faint focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-text font-medium">
                Email Address
              </label>
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={mode === 'register' ? 'email' : 'username'}
                className="w-full px-3.5 py-2.5 rounded-md bg-bg-subtle border border-card-border text-base sm:text-sm text-text placeholder:text-text-faint focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-text font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full px-3.5 py-2.5 pr-12 rounded-md bg-bg-subtle border border-card-border text-base sm:text-sm text-text placeholder:text-text-faint focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-text-faint hover:text-text transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase tracking-wider text-text font-medium">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-3.5 py-2.5 rounded-md bg-bg-subtle border border-card-border text-base sm:text-sm text-text placeholder:text-text-faint focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                  />
                </div>

                <div className="pt-1">
                  <label className="flex items-start gap-2.5 text-xs text-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-0.5 rounded border-card-border text-primary focus:ring-primary h-4 w-4 accent-primary"
                    />
                    <span>
                      I consent to on-device audio and video verification during technical interviews.
                    </span>
                  </label>
                </div>
              </>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 min-h-[44px] bg-primary hover:bg-primary-hover text-primary-ink font-semibold rounded-md shadow-sm mt-2 transition-all cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-primary-ink/20 border-t-primary-ink rounded-full animate-spin" />
                  Processing...
                </span>
              ) : mode === 'login' ? (
                'Sign In to Dashboard'
              ) : (
                'Create Candidate Account'
              )}
            </Button>

            <div className="pt-2 border-t border-card-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fillDemoCandidate}
                className="w-full text-xs text-primary border-dashed border-card-border hover:bg-bg-subtle cursor-pointer min-h-[44px] sm:min-h-0"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-accent" />
                Fill Demo Candidate Credentials
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
