import React, { useState } from 'react';
import { ShieldAlert, X, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { detectBrowser } from '@/lib/maskedDiagnostics';

export interface PermissionHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

type BrowserTab = 'chrome' | 'edge' | 'firefox' | 'safari';

function getInitialBrowserTab(): BrowserTab {
  if (typeof navigator === 'undefined') return 'chrome';
  const detected = detectBrowser(navigator.userAgent).toLowerCase();
  if (detected.includes('edge')) return 'edge';
  if (detected.includes('firefox')) return 'firefox';
  if (detected.includes('safari')) return 'safari';
  return 'chrome';
}

export function PermissionHelpModal({
  isOpen,
  onClose,
  onRetry,
}: PermissionHelpModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<BrowserTab>(getInitialBrowserTab());

  if (!isOpen) return null;

  const handleRetry = () => {
    onClose();
    if (onRetry) onRetry();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep-1/60 backdrop-blur-sm p-4 animate-in fade-in">
      <Card className="w-full max-w-lg card-editorial shadow-2xl flex flex-col max-h-[90dvh]">
        <CardHeader className="pb-3 border-b border-card-border flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-peach border border-accent/20 flex items-center justify-center text-accent">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base text-text font-display font-bold">How to Unblock Microphone & Camera</CardTitle>
              <p className="text-[11px] text-text-muted">Step-by-step permission instructions by browser</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-11 w-11 sm:h-8 sm:w-8 p-0 text-text-muted hover:text-text flex items-center justify-center"
            aria-label="Close permission help"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        {/* Browser Selector Tabs */}
        <div className="flex border-b border-card-border bg-bg-subtle px-3 sm:px-4 pt-2 gap-1 text-xs shrink-0 overflow-x-auto">
          {(
            [
              { id: 'chrome', label: 'Google Chrome' },
              { id: 'edge', label: 'Microsoft Edge' },
              { id: 'firefox', label: 'Firefox' },
              { id: 'safari', label: 'Safari' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 flex items-center whitespace-nowrap font-medium rounded-t-lg transition-colors border-b-2 text-[11px] cursor-pointer ${
                activeTab === t.id
                  ? 'border-primary text-primary font-bold bg-card'
                  : 'border-transparent text-text-muted hover:text-text hover:bg-card/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <CardContent className="pt-4 space-y-4 text-xs text-text overflow-y-auto flex-1">
          {activeTab === 'chrome' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-mint/40 border border-primary/20 space-y-1">
                <span className="font-semibold text-primary flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider">
                  <Settings className="h-3.5 w-3.5" />
                  Address Bar Shortcut
                </span>
                <p className="text-text text-[11px] leading-relaxed">
                  Click the <strong>tune/lock icon</strong> to the immediate left of the URL in Chrome, then toggle <strong>Microphone</strong> to <strong>Allow</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-text font-display">Full Settings Path:</h4>
                <ol className="list-decimal pl-5 space-y-1 text-text-muted text-[11px] leading-relaxed font-sans">
                  <li>Open Chrome <strong>Settings → Privacy and security → Site Settings</strong>.</li>
                  <li>Click <strong>Microphone</strong> (or visit <code className="text-primary bg-bg-subtle border border-card-border px-1 py-0.5 rounded font-mono">chrome://settings/content/microphone</code>).</li>
                  <li>Ensure <strong>&quot;Sites can ask to use your microphone&quot;</strong> is selected and this site is not in the &quot;Not allowed&quot; list.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                <h5 className="font-semibold text-warning text-[11px]">Windows / macOS System Permissions:</h5>
                <p className="text-text-muted text-[11px] leading-relaxed">
                  If Chrome shows permission allowed but audio is still blocked: Open <strong>Windows Settings → Privacy &amp; security → Microphone</strong> and make sure <strong>&quot;Let desktop apps access your microphone&quot;</strong> is turned <strong>On</strong>.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'edge' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-mint/40 border border-primary/20 space-y-1">
                <span className="font-semibold text-primary flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider">
                  <Settings className="h-3.5 w-3.5" />
                  Address Bar Shortcut
                </span>
                <p className="text-text text-[11px] leading-relaxed">
                  Click the <strong>Lock icon</strong> in the address bar, find <strong>Microphone</strong>, and switch it from <em>Block</em> to <strong>Allow</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-text font-display">Full Settings Path:</h4>
                <ol className="list-decimal pl-5 space-y-1 text-text-muted text-[11px] leading-relaxed font-sans">
                  <li>Navigate to <code className="text-primary bg-bg-subtle border border-card-border px-1 py-0.5 rounded font-mono">edge://settings/content/microphone</code>.</li>
                  <li>Verify <strong>&quot;Ask before accessing&quot;</strong> is enabled and remove any block entry for this address.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'firefox' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-mint/40 border border-primary/20 space-y-1">
                <span className="font-semibold text-primary flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider">
                  <Settings className="h-3.5 w-3.5" />
                  Address Bar Shortcut
                </span>
                <p className="text-text text-[11px] leading-relaxed">
                  Click the <strong>Microphone icon</strong> next to the URL, clear the <strong>Blocked Temporarily</strong> flag, and click <strong>Allow</strong> when prompted.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-text font-display">Full Settings Path:</h4>
                <ol className="list-decimal pl-5 space-y-1 text-text-muted text-[11px] leading-relaxed font-sans">
                  <li>Go to <strong>Settings → Privacy &amp; Security → Permissions → Microphone</strong>.</li>
                  <li>Click <strong>Settings…</strong> and ensure this website is set to <strong>Allow</strong>.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'safari' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-mint/40 border border-primary/20 space-y-1">
                <span className="font-semibold text-primary flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider">
                  <Settings className="h-3.5 w-3.5" />
                  Website Preferences
                </span>
                <p className="text-text text-[11px] leading-relaxed">
                  Select <strong>Safari → Settings for This Website…</strong> from the top menu, then set <strong>Microphone</strong> to <strong>Allow</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-text font-display">macOS System Privacy:</h4>
                <ol className="list-decimal pl-5 space-y-1 text-text-muted text-[11px] leading-relaxed font-sans">
                  <li>Open <strong>System Settings → Privacy &amp; Security → Microphone</strong>.</li>
                  <li>Check that <strong>Safari</strong> is enabled in the list.</li>
                </ol>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-card-border flex items-center justify-between">
            <span className="text-[11px] text-text-faint font-mono">Local processing: Audio is not stored</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs border-card-border text-text hover:bg-bg-subtle min-h-[44px] sm:min-h-0 sm:h-8 px-3.5"
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleRetry}
                className="bg-primary hover:bg-primary-hover text-primary-ink text-xs min-h-[44px] sm:min-h-0 sm:h-8 px-4 font-medium"
              >
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
