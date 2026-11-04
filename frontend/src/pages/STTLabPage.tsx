import React from 'react';
import { STTLab } from '@/components/dev/STTLab';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const STTLabPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-bg text-text selection:bg-mint/20">
      {/* Top Navigation */}
      <header className="border-b border-card-border bg-card/60 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  window.location.href = '/';
                }
              }}
              className="gap-1.5 text-xs font-sans border-card-border cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-text">
                InterviewForge
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mint text-primary border border-primary/20 font-bold">
                STT Lab
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.href = '/';
              }}
              className="text-xs font-sans text-text-muted hover:text-text cursor-pointer"
            >
              Home
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-6">
        <STTLab />
      </main>
    </div>
  );
};

