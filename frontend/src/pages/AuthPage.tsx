import React, { useState } from 'react';
import { LogIn, UserPlus, Shield, Sparkles, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';

interface AuthPageProps {
  initialMode?: 'login' | 'register';
}

export default function AuthPage({ initialMode }: AuthPageProps = {}): React.ReactElement {
  const { login, register, error, clearError, isLoading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(
    initialMode || (typeof window !== 'undefined' && window.location.pathname.includes('register') ? 'register' : 'login')
  );
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localValidation, setLocalValidation] = useState<string | null>(null);

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
    if (mode === 'register' && !fullName.trim()) {
      setLocalValidation('Please enter your full name.');
      return;
    }

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, fullName, password);
      }
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const redirect = params?.get('redirect') || '/app/dashboard';
      window.location.href = redirect;
    } catch {
      // Error handled by AuthContext
    }
  };

  const fillDemoCandidate = () => {
    setEmail('candidate.alex@example.com');
    setFullName('Alex Mercer');
    setPassword('InterviewReady2026!');
    setLocalValidation(null);
    clearError();
  };

  return (
    <div className="w-full max-w-md mx-auto my-auto py-8 px-4">
      <Card className="card-editorial border-card-border bg-card shadow-card">
        <CardHeader className="space-y-4 pb-6">
          <div className="flex items-center justify-between">
            <div className="h-11 w-11 rounded-xl bg-mint flex items-center justify-center text-primary shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <Badge variant="mono">ARGON2ID + JWT</Badge>
          </div>

          <div className="space-y-1">
            <div className="label-mono">01 // CANDIDATE ACCESS</div>
            <CardTitle className="font-display text-2xl sm:text-3xl text-text font-semibold tracking-tight">
              {mode === 'login' ? 'Candidate Sign In' : 'Create Candidate Account'}
            </CardTitle>
            <CardDescription className="text-text-muted text-xs sm:text-sm">
              {mode === 'login'
                ? 'Enter your credentials to access your mock interview dashboard'
                : 'Register to start live adaptive AI mock interviews'}
            </CardDescription>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-bg-subtle rounded-lg border border-card-border gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                clearError();
                setLocalValidation(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-primary text-primary-ink shadow-sm'
                  : 'text-text-muted hover:text-text hover:bg-card/60'
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                clearError();
                setLocalValidation(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'register'
                  ? 'bg-primary text-primary-ink shadow-sm'
                  : 'text-text-muted hover:text-text hover:bg-card/60'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register
            </button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || localValidation) && (
              <div className="p-3.5 rounded-lg bg-danger/10 border border-danger/25 text-danger text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{localValidation || error}</span>
              </div>
            )}

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
                  className="w-full px-3.5 py-2.5 rounded-md bg-bg-subtle border border-card-border text-sm text-text placeholder:text-text-faint focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
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
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-md bg-bg-subtle border border-card-border text-sm text-text placeholder:text-text-faint focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
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
                  className="w-full px-3.5 py-2.5 pr-10 rounded-md bg-bg-subtle border border-card-border text-sm text-text placeholder:text-text-faint focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-primary hover:bg-primary-hover text-primary-ink font-semibold rounded-md shadow-sm mt-2 transition-all"
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
                className="w-full text-xs text-primary border-dashed border-card-border hover:bg-bg-subtle"
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
