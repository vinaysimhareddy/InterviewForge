import React from 'react';
import {
  Sparkles,
  Shield,
  Code2,
  Terminal,
  ArrowRight,
  Sun,
  Moon,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/context/ThemeContext';

export default function DesignSystemPage(): React.ReactElement {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [checkboxSample, setCheckboxSample] = React.useState<boolean>(true);

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent-soft selection:text-accent font-sans transition-colors duration-200 overflow-x-hidden">
      {/* Top Banner / Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/85 border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-semibold tracking-tight text-primary">
              Adaptive<span className="italic text-accent ml-1">Mock</span>
            </span>
            <span className="label-mono bg-bg-subtle px-2 py-0.5 rounded border border-card-border">
              DS // TOKENS & SYSTEM
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              className="gap-2"
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{resolvedTheme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.search = '';
              }}
              className="text-text-muted hover:text-text"
            >
              Return Home
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Showcase */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {/* Intro */}
        <section className="space-y-4">
          <div className="label-mono">00 // EDITORIAL DESIGN LANGUAGE</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-text leading-[1.1] tracking-tight">
            Design Tokens & <span className="italic font-normal text-accent">Component Architecture</span>
          </h1>
          <p className="text-text-muted text-base sm:text-lg max-w-3xl leading-relaxed">
            A calm, editorial, premium-professional light aesthetic based on warm cream surfaces, off-white cards with hairline borders, deep forest-green brand anchors, and subtle burnt-orange accents.
          </p>
        </section>

        {/* 01 // Color Tokens & Swatches */}
        <section className="space-y-6 pt-8 border-t border-card-border">
          <div className="flex items-center justify-between">
            <div className="label-mono">01 // COLOR TOKEN SYSTEM</div>
            <span className="text-xs text-text-faint font-mono">WCAG AA Compliant</span>
          </div>

          {/* Surfaces */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text uppercase tracking-wider font-mono">Surfaces & Structure</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { name: '--bg', hex: '#F4F1EA', label: 'Warm Cream Page' },
                { name: '--bg-subtle', hex: '#EFEBE2', label: 'Alternate Section' },
                { name: '--card', hex: '#FBFAF6', label: 'Off-White Card' },
                { name: '--card-border', hex: '#E3DED2', label: 'Hairline Border' },
                { name: '--muted-surface', hex: '#F1EEE6', label: 'Muted Surface' },
              ].map((swatch) => (
                <div key={swatch.name} className="p-3 rounded-lg border border-card-border bg-card space-y-2 min-w-0">
                  <div
                    className="h-14 rounded-md border border-card-border/60 shadow-inner flex items-center justify-center font-mono text-xs font-semibold"
                    style={{ backgroundColor: swatch.hex }}
                  >
                    <span className="text-[#1C2420] text-[11px] truncate">{swatch.hex}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-text truncate">{swatch.name}</div>
                    <div className="text-[11px] text-text-muted truncate">{swatch.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Brand & Text */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text uppercase tracking-wider font-mono">Brand, Gradients & Typography</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { name: '--primary', hex: '#0F4A3A', label: 'Forest Green (Solid)', text: '#F4F1EA' },
                { name: '--primary-hover', hex: '#0B3A2D', label: 'Hover State', text: '#F4F1EA' },
                { name: '--deep-1', hex: '#0A2E24', label: 'Gradient Start', text: '#F4F1EA' },
                { name: '--deep-2', hex: '#14503F', label: 'Gradient End', text: '#F4F1EA' },
                { name: '--accent', hex: '#C2410C', label: 'Burnt Orange (Accent)', text: '#FFFFFF' },
              ].map((swatch) => (
                <div key={swatch.name} className="p-3 rounded-lg border border-card-border bg-card space-y-2 min-w-0">
                  <div
                    className="h-14 rounded-md shadow-inner flex items-center justify-center font-mono text-xs font-semibold"
                    style={{ backgroundColor: swatch.hex, color: swatch.text }}
                  >
                    <span className="truncate">{swatch.hex}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-text truncate">{swatch.name}</div>
                    <div className="text-[11px] text-text-muted truncate">{swatch.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pastel Tints & Status */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text uppercase tracking-wider font-mono">Pastel Tints & Status Roles</h3>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {[
                { name: '--mint', hex: '#E3EFE8', label: 'Mint Pastel' },
                { name: '--peach', hex: '#F8E7DC', label: 'Peach Pastel' },
                { name: '--sky', hex: '#E4ECF5', label: 'Sky Pastel' },
                { name: '--sand', hex: '#F0E9D8', label: 'Sand Pastel' },
                { name: '--success', hex: '#1F7A55', label: 'Success' },
                { name: '--danger', hex: '#B42318', label: 'Danger / Error' },
              ].map((swatch) => (
                <div key={swatch.name} className="p-3 rounded-lg border border-card-border bg-card space-y-2 min-w-0">
                  <div
                    className="h-12 rounded-md border border-card-border/60 shadow-inner flex items-center justify-center font-mono text-xs font-semibold"
                    style={{ backgroundColor: swatch.hex }}
                  >
                    <span className="text-[#1C2420] text-[11px] truncate">{swatch.hex}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-text truncate">{swatch.name}</div>
                    <div className="text-[11px] text-text-muted truncate">{swatch.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 02 // Typography Scale */}
        <section className="space-y-6 pt-8 border-t border-card-border">
          <div className="label-mono">02 // TYPOGRAPHY HIERARCHY</div>
          <div className="card-editorial p-6 sm:p-8 space-y-6">
            <div className="border-b border-card-border pb-4 space-y-1">
              <span className="text-xs text-text-faint font-mono">Display Hero Serif (Newsreader, 56-64px Desktop / 36-40px Mobile)</span>
              <div className="font-display text-4xl sm:text-5xl lg:text-6xl text-text leading-[1.1] tracking-tight">
                Interviews that adapt, listen, and <span className="italic text-accent">reveal truth.</span>
              </div>
            </div>

            <div className="border-b border-card-border pb-4 space-y-1">
              <span className="text-xs text-text-faint font-mono">Section Heading Serif (36-44px Desktop / 28px Mobile)</span>
              <div className="font-display text-2xl sm:text-3xl lg:text-4xl text-text leading-tight">
                Engineered for Seniority Precision & Honest Feedback
              </div>
            </div>

            <div className="border-b border-card-border pb-4 space-y-1">
              <span className="text-xs text-text-faint font-mono">Body / UI (Inter, 16-18px, text-text-muted)</span>
              <p className="text-text-muted text-base sm:text-lg leading-relaxed max-w-3xl">
                Every interview dynamically pulls relevant questions grounded directly in your uploaded resume and target seniority level. Responses are continuously evaluated across multi-dimensional criteria without synthetic inflation.
              </p>
            </div>

            <div className="space-y-1 min-w-0">
              <span className="text-xs text-text-faint font-mono block break-words">Monospace Micro / Eyebrow Label (JetBrains Mono, 11-12px, Uppercase, Tracked)</span>
              <div className="label-mono break-words">03 // ADAPTIVE GRAPH ARCHITECTURE & EVALUATION RUBRIC</div>
            </div>
          </div>
        </section>

        {/* 03 // Buttons & Interactive States */}
        <section className="space-y-6 pt-8 border-t border-card-border">
          <div className="label-mono">03 // BUTTONS & ACTION CONTROLS</div>
          <div className="card-editorial p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="default">Primary Forest</Button>
              <Button variant="accent">Accent Rust</Button>
              <Button variant="outline">Secondary Outline</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="destructive">Destructive Action</Button>
              <Button variant="default" size="pill">
                Pill CTA <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
              <Button variant="default" disabled>
                Disabled
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-card-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sample-checkbox"
                  checked={checkboxSample}
                  onCheckedChange={setCheckboxSample}
                />
                <label htmlFor="sample-checkbox" className="text-sm text-text cursor-pointer select-none">
                  Consent verification checkbox
                </label>
              </div>

              <Tooltip content="Verified client-side cryptographic telemetry running locally.">
                <span className="text-xs text-primary font-medium underline underline-offset-4 cursor-help flex items-center gap-1">
                  Hover for Tooltip <ExternalLink className="h-3 w-3" />
                </span>
              </Tooltip>
            </div>
          </div>
        </section>

        {/* 04 // Icon Tiles & Pastel Badges */}
        <section className="space-y-6 pt-8 border-t border-card-border">
          <div className="label-mono">04 // ICON TILES & BADGES</div>

          {/* 40-44px Icon Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="card-editorial p-5 flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-mint flex items-center justify-center text-primary shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">MINT TINT</span>
                <h4 className="font-semibold text-text text-sm">Adaptive Turn Engine</h4>
                <p className="text-xs text-text-muted mt-1">Questions evolve based on previous technical answers.</p>
              </div>
            </div>

            <div className="card-editorial p-5 flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-peach flex items-center justify-center text-accent shrink-0">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">PEACH TINT</span>
                <h4 className="font-semibold text-text text-sm">Resume-Aware RAG</h4>
                <p className="text-xs text-text-muted mt-1">Grounded strictly in candidate projects and skills.</p>
              </div>
            </div>

            <div className="card-editorial p-5 flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-sky flex items-center justify-center text-info shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">SKY TINT</span>
                <h4 className="font-semibold text-text text-sm">On-Device Privacy</h4>
                <p className="text-xs text-text-muted mt-1">Zero raw video stored; browser WebAssembly processing.</p>
              </div>
            </div>

            <div className="card-editorial p-5 flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-sand flex items-center justify-center text-[#8A5B15] shrink-0">
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">SAND TINT</span>
                <h4 className="font-semibold text-text text-sm">Level Clamping</h4>
                <p className="text-xs text-text-muted mt-1">Mid stays Mid; prevents staff-tier scope drift.</p>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="default">Primary Forest</Badge>
            <Badge variant="accent">Accent Rust</Badge>
            <Badge variant="success">Verified Live</Badge>
            <Badge variant="warning">Advisory Notice</Badge>
            <Badge variant="destructive">Face Lost</Badge>
            <Badge variant="sky">WebAssembly CV</Badge>
            <Badge variant="mono">01 // STEP ONE</Badge>
            <Badge variant="secondary">Mid-Level Tier</Badge>
          </div>
        </section>

        {/* 05 // Dark Forest-Green Gradient Band Preview */}
        <section className="space-y-6 pt-8 border-t border-card-border">
          <div className="label-mono">05 // DEEP FOREST-GREEN GRADIENT BAND (CTA & LIVE STAGE)</div>
          <div className="rounded-2xl bg-deep-band p-8 sm:p-12 text-primary-ink border border-primary/20 space-y-6 shadow-elevated">
            <div className="max-w-2xl space-y-3">
              <span className="font-mono text-xs uppercase tracking-widest text-mint/90 font-medium">
                INTERVIEW STAGE & EMPHASIS SURFACE
              </span>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-primary-ink leading-tight">
                Ready to experience an interview that <span className="italic text-peach">tells you the truth?</span>
              </h2>
              <p className="text-mint/80 text-sm sm:text-base leading-relaxed">
                Experience realistic adaptive questioning, immediate category scoring, and comprehensive actionable feedback without synthetic fluff.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button className="bg-bg text-primary hover:bg-card shadow-lg font-semibold px-6 py-2.5 rounded-full">
                Start Practicing Free
              </Button>
              <Button variant="outline" className="border-mint/30 bg-transparent text-primary-ink hover:bg-white/10 rounded-full">
                Learn Architecture
              </Button>
            </div>
          </div>
        </section>

        {/* 06 // Editorial Card Variants */}
        <section className="space-y-6 pt-8 border-t border-card-border">
          <div className="label-mono">06 // CARD STYLES & LAYOUT</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="mint">Active Session</Badge>
                  <span className="text-xs text-text-faint font-mono">15m</span>
                </div>
                <CardTitle className="mt-3 text-lg font-display">Technical Depth</CardTitle>
                <CardDescription>
                  Evaluates architectural reasoning, algorithmic tradeoffs, and concrete implementation examples.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-text-muted">
                Score: <strong className="text-text">88/100</strong> (Strong Hire tier)
              </CardContent>
              <CardFooter className="border-t border-card-border pt-4">
                <Button variant="outline" size="sm" className="w-full">
                  Inspect Rubric
                </Button>
              </CardFooter>
            </Card>

            <Card className="bg-bg-subtle">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="accent">Sample Mock</Badge>
                  <span className="text-xs text-text-faint font-mono">Senior</span>
                </div>
                <CardTitle className="mt-3 text-lg font-display">Adaptive Difficulty</CardTitle>
                <CardDescription>
                  Continuous numeric adjustment between 3.0 and 5.0 with level-clamped boundaries.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-text-muted">
                Status: <strong className="text-accent">Level Clamped</strong>
              </CardContent>
              <CardFooter className="border-t border-card-border pt-4">
                <Button variant="default" size="sm" className="w-full">
                  View Transition Graph
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="sky">On-Device</Badge>
                  <span className="text-xs text-text-faint font-mono">99.4%</span>
                </div>
                <CardTitle className="mt-3 text-lg font-display">Composure & Integrity</CardTitle>
                <CardDescription>
                  Synthesizes blink cadence, head pose stability, and speech pacing into honest signals.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-text-muted">
                Verdict: <strong className="text-success">Verified Live Segment</strong>
              </CardContent>
              <CardFooter className="border-t border-card-border pt-4">
                <Button variant="outline" size="sm" className="w-full">
                  Telemetry Details
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-card-border bg-bg-subtle py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">Adaptive Mock-Interview Platform</span>
            <span>•</span>
            <span>Design Tokens Reference</span>
          </div>
          <div className="font-mono text-text-faint">
            Warm Cream #F4F1EA • Forest Green #0F4A3A • Burnt Orange #C2410C
          </div>
        </div>
      </footer>
    </div>
  );
}
