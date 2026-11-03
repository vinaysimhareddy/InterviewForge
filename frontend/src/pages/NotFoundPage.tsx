import React, { useEffect } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/common/Logo';
import { formatPageTitle } from '@/copy/glossary';

export default function NotFoundPage(): React.ReactElement {
  useEffect(() => {
    document.title = formatPageTitle('Page Not Found');
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-soft selection:text-accent font-sans">
      {/* Top Header */}
      <header className="border-b border-card-border bg-bg/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo href="/" size="md" responsive={true} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = '/';
            }}
            className="text-text-muted hover:text-text gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </div>
      </header>

      {/* Main 404 Hero */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in">
          {/* Logo Mark with Broken Link / Error Badge */}
          <div className="relative inline-flex items-center justify-center">
            <div className="p-4 rounded-3xl bg-bg-subtle border border-card-border shadow-soft">
              <Logo variant="mark" size={64} />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-destructive text-destructive-foreground p-1.5 rounded-full shadow-md border-2 border-bg">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>

          <div className="space-y-2">
            <Badge variant="mono" className="text-xs">
              ERROR 404 // RESOURCE NOT FOUND
            </Badge>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-text tracking-tight">
              Page Not Found
            </h1>
            <p className="text-sm text-text-muted leading-relaxed">
              The page, session, or interview route you requested does not exist or may have been archived.
            </p>
          </div>

          <div className="pt-2">
            <Button
              size="lg"
              className="w-full sm:w-auto px-8 gap-2 bg-primary text-primary-ink font-semibold hover:bg-primary/90"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              <ArrowLeft className="h-4 w-4" /> Return to Home
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-card-border bg-bg-subtle py-4 text-center text-xs text-text-muted">
        InterviewForge • Adaptive Technical Preparation
      </footer>
    </div>
  );
}

