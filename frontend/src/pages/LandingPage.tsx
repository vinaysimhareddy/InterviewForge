import React, { useState } from 'react';
import {
  Sparkles,
  Shield,
  Code2,
  Mic,
  Camera,
  FileText,
  ChevronDown,
  ArrowRight,
  Check,
  CheckCircle2,
  Sliders,
  Layers,
  Lock,
  ExternalLink,
  Laptop,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogoWordmark } from '@/components/common/LogoWordmark';
import { useAuth } from '@/context/AuthContext';
import { formatPageTitle } from '@/copy/glossary';

export default function LandingPage(): React.ReactElement {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState<number>(0);
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  React.useEffect(() => {
    document.title = formatPageTitle('Practice Technical Interviews');
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleMobileNavClick = (anchorId: string) => {
    setMobileMenuOpen(false);
    const elem = document.getElementById(anchorId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const showPricing = import.meta.env.VITE_SHOW_PRICING !== 'false';

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent-soft selection:text-accent font-sans transition-colors duration-200 overflow-x-hidden">
      {/* 1. TOP NAV (Sticky blurred cream) */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-bg/90 border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="hover:opacity-95 transition-opacity shrink-0">
            <LogoWordmark />
          </a>

          {/* Nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-text-muted">
            <a href="#how-it-works" className="hover:text-text transition-colors">How it works</a>
            <a href="#features" className="hover:text-text transition-colors">Features</a>
            <a href="#tracks" className="hover:text-text transition-colors">Interview tracks</a>
            <a href="#privacy" className="hover:text-text transition-colors">Privacy</a>
            <a href="#faq" className="hover:text-text transition-colors">FAQ</a>
          </nav>

          {/* Action buttons (Desktop) */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    window.location.href = '/app/dashboard';
                  }}
                  className="rounded-full px-4 min-h-[44px] sm:min-h-0"
                >
                  Go to Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
                <div
                  className="h-8 w-8 rounded-full bg-mint border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary"
                  title={user.full_name}
                >
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.location.href = '/login';
                  }}
                  className="text-text-muted hover:text-text min-h-[44px] sm:min-h-0"
                >
                  Sign in
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    window.location.href = '/register';
                  }}
                  className="rounded-full px-4 shadow-sm min-h-[44px] sm:min-h-0"
                >
                  Get started free
                </Button>
              </>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex items-center gap-2 md:hidden">
            {user && (
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/app/dashboard';
                }}
                className="h-9 w-9 rounded-full bg-mint border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary cursor-pointer touch-manipulation"
                aria-label="Go to Dashboard"
              >
                {user.full_name.charAt(0).toUpperCase()}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="p-2.5 rounded-xl border border-card-border bg-card text-text hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors cursor-pointer touch-manipulation"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Sheet / Drawer */}
        {mobileMenuOpen && (
          <div
            className="md:hidden border-b border-card-border bg-card/98 backdrop-blur-lg px-4 pt-3 pb-6 space-y-4 shadow-elevated animate-in slide-in-from-top-2 duration-200"
            role="dialog"
            aria-label="Mobile Navigation Menu"
          >
            <nav className="flex flex-col space-y-1 text-sm font-medium text-text">
              <button
                type="button"
                onClick={() => handleMobileNavClick('how-it-works')}
                className="text-left py-2.5 px-3 rounded-lg hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center"
              >
                How it works
              </button>
              <button
                type="button"
                onClick={() => handleMobileNavClick('features')}
                className="text-left py-2.5 px-3 rounded-lg hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => handleMobileNavClick('tracks')}
                className="text-left py-2.5 px-3 rounded-lg hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center"
              >
                Interview tracks
              </button>
              <button
                type="button"
                onClick={() => handleMobileNavClick('privacy')}
                className="text-left py-2.5 px-3 rounded-lg hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center"
              >
                Privacy
              </button>
              <button
                type="button"
                onClick={() => handleMobileNavClick('faq')}
                className="text-left py-2.5 px-3 rounded-lg hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center"
              >
                FAQ
              </button>
            </nav>

            <div className="pt-3 border-t border-card-border space-y-2">
              {user ? (
                <Button
                  variant="default"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    window.location.href = '/app/dashboard';
                  }}
                  className="w-full rounded-full min-h-[44px] font-semibold"
                >
                  Go to Dashboard <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      window.location.href = '/login';
                    }}
                    className="w-full rounded-full min-h-[44px] font-medium"
                  >
                    Sign in
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      window.location.href = '/register';
                    }}
                    className="w-full rounded-full min-h-[44px] font-semibold"
                  >
                    Get started free
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="main-content">
        {/* 2. HERO SECTION */}
        <section className="relative pt-12 pb-16 sm:pt-24 sm:pb-28 bg-hero-wash border-b border-card-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 sm:space-y-12">
          {/* Text and CTAs */}
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-card-border shadow-sm">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="label-mono text-[11px] text-text-faint tracking-wider">
                FREE · VOICE-BASED · ADAPTIVE
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-text leading-[1.15] tracking-tight">
              Practice interviews that listen, adapt, and{' '}
              <span className="italic font-normal text-accent">tell you the truth</span>
            </h1>

            <p className="text-text-muted text-sm sm:text-lg lg:text-xl leading-relaxed max-w-2xl mx-auto font-normal">
              An adaptive voice-to-voice interview simulator grounded in your resume and target seniority level, with honest multi-dimensional scorecard feedback.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2 w-full max-w-md sm:max-w-none mx-auto">
              <Button
                variant="default"
                size="lg"
                onClick={() => {
                  window.location.href = user ? '/app/setup' : '/register';
                }}
                className="w-full sm:w-auto rounded-full px-8 py-3.5 shadow-md text-base min-h-[44px]"
              >
                {user ? 'Start Practicing Now' : 'Start Practicing Free'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto rounded-full px-7 text-base hover:bg-bg-subtle min-h-[44px]"
              >
                See how it works
              </Button>
            </div>

            {/* 3 Truth facts */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-4 text-xs text-text-faint font-medium">
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary stroke-[3]" />
                <span>Voice-to-voice conversational AI</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary stroke-[3]" />
                <span>Resume-aware adaptive questions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary stroke-[3]" />
                <span>100% on-device vision analysis</span>
              </div>
            </div>
          </div>

          {/* 3. PRODUCT PREVIEW CARD (Framed window mockup with sample data) */}
          <div className="max-w-5xl mx-auto pt-2 sm:pt-6">
            <div className="rounded-2xl border border-card-border bg-card shadow-elevated overflow-hidden">
              {/* Window Title Bar */}
              <div className="bg-bg-subtle px-4 py-3 border-b border-card-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-card-border inline-block" />
                  <span className="h-3 w-3 rounded-full bg-card-border inline-block" />
                  <span className="h-3 w-3 rounded-full bg-card-border inline-block" />
                  <span className="text-xs font-mono text-text-faint ml-2 hidden sm:inline">
                    session-simulation // full-stack-senior
                  </span>
                </div>
                <Badge variant="mono">SAMPLE DATA PREVIEW</Badge>
              </div>

              {/* Split Content: Left = Live Stage Mockup, Right = Sample Scorecard */}
              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-card-border">
                {/* Left Mini Live Stage */}
                <div className="lg:col-span-7 p-5 sm:p-8 bg-deep-band text-primary-ink space-y-6 flex flex-col justify-between">
                  <div className="flex flex-wrap items-center justify-between text-xs text-mint/80 font-mono gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                      LIVE AUDIO TURN 3 / 5
                    </span>
                    <span>ADAPTIVE TIER: SENIOR (3.5)</span>
                  </div>

                  {/* AI Orb & Active Question Caption */}
                  <div className="space-y-4 py-4 text-center">
                    <div className="h-16 w-16 mx-auto rounded-full bg-mint/20 border border-mint/40 flex items-center justify-center animate-orb-breathe shadow-lg shadow-mint/10">
                      <Sparkles className="h-7 w-7 text-mint" />
                    </div>
                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="label-mono text-[10px] text-peach">INTERVIEWER QUESTION</span>
                      <p className="font-display text-base sm:text-xl text-primary-ink leading-snug">
                        "How do you guarantee distributed idempotency when handling payment event updates across microservices?"
                      </p>
                    </div>
                  </div>

                  {/* Live Candidate Answer Transcript Line */}
                  <div className="bg-white/10 backdrop-blur-sm p-3.5 sm:p-4 rounded-xl border border-white/15 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-mint/80">
                      <span>CANDIDATE SPEECH (REAL-TIME)</span>
                      <span className="text-emerald-300">Speaking...</span>
                    </div>
                    <p className="text-xs text-primary-ink/90 leading-relaxed italic">
                      "We store unique requestId keys with TTL in Redis, using transactional outbox for atomic status transitions in Postgres..."
                    </p>
                  </div>
                </div>

                {/* Right Sample Scorecard */}
                <div className="lg:col-span-5 p-5 sm:p-8 bg-card space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="label-mono text-[10px]">EXECUTIVE SCORECARD</span>
                      <h4 className="font-display text-xl text-text font-semibold">Evaluation Verdict</h4>
                    </div>
                    <Badge variant="success">Strong Hire</Badge>
                  </div>

                  {/* Overall Big Score */}
                  <div className="p-4 rounded-xl bg-bg-subtle border border-card-border flex items-baseline justify-between">
                    <span className="text-xs font-mono text-text-muted">OVERALL SCORE</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-3xl font-bold text-primary">88</span>
                      <span className="text-xs text-text-faint font-mono">/ 100</span>
                    </div>
                  </div>

                  {/* Score Bars */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between font-mono mb-1 text-text-muted">
                        <span>Technical Depth</span>
                        <span className="text-text font-semibold">90%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted-surface overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: '90%' }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-mono mb-1 text-text-muted">
                        <span>Communication Clarity</span>
                        <span className="text-text font-semibold">86%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted-surface overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: '86%' }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-mono mb-1 text-text-muted">
                        <span>Composure &amp; Integrity</span>
                        <span className="text-text font-semibold">88%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted-surface overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: '88%' }} />
                      </div>
                    </div>
                  </div>

                  {/* Verified Telemetry Note */}
                  <div className="p-3 rounded-lg bg-mint/40 border border-mint flex items-start gap-2.5 text-xs text-primary">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Client-side MediaPipe verified. Zero video persisted.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. WHAT YOU CAN PRACTICE STRIP (Role & Level Chips) */}
      <section id="tracks" className="py-12 bg-bg-subtle border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-center">
          <div className="label-mono">AVAILABLE INTERVIEW TRACKS &amp; CALIBRATION TIERS</div>
          
          <div className="space-y-4">
            {/* Role Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {[
                'Frontend Architecture',
                'Backend & Distributed Systems',
                'Full Stack Engineering',
                'Data Infrastructure',
                'DevOps & Cloud Native',
                'Mobile Engineering',
              ].map((role) => (
                <span
                  key={role}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-card border border-card-border text-text shadow-sm hover:border-primary/40 transition-colors"
                >
                  {role}
                </span>
              ))}
            </div>

            {/* Seniority Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <span className="text-xs text-text-faint font-mono mr-2">CALIBRATED TO:</span>
              {['Junior', 'Mid-Level', 'Senior', 'Staff / Lead'].map((level) => (
                <span
                  key={level}
                  className="px-2.5 py-1 rounded-md text-xs font-mono bg-bg border border-card-border text-text-muted"
                >
                  {level}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. FEATURES GRID (4 Cards with Pastel Icon Tiles) */}
      <section id="features" className="py-16 sm:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="label-mono">01 // CORE ARCHITECTURE</div>
          <h2 className="font-display text-3xl sm:text-4xl text-text font-semibold tracking-tight">
            Engineered for Precision, Not Generic Prompts
          </h2>
          <p className="text-text-muted text-sm sm:text-base">
            Every session is driven by an adaptive turn engine combining token-budgeted RAG with client-side vision heuristics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 - Mint */}
          <Card className="hover:border-primary/40 transition-colors">
            <CardHeader className="space-y-4">
              <div className="h-11 w-11 rounded-xl bg-mint flex items-center justify-center text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">01 // ADAPTIVE</span>
                <CardTitle className="mt-1 text-base font-display">Adaptive Voice Turn</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed">
              Questions don't follow static linear scripts. Each question directly analyzes your previous response, probing deeper into technical decisions.
            </CardContent>
          </Card>

          {/* Card 2 - Peach */}
          <Card className="hover:border-accent/40 transition-colors">
            <CardHeader className="space-y-4">
              <div className="h-11 w-11 rounded-xl bg-peach flex items-center justify-center text-accent">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">02 // RAG-GROUNDED</span>
                <CardTitle className="mt-1 text-base font-display">Resume-Aware Questions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed">
              Your uploaded resume is parsed and embedded into semantic chunks. Questions are grounded strictly in your listed projects and real skills.
            </CardContent>
          </Card>

          {/* Card 3 - Sand */}
          <Card className="hover:border-warning/40 transition-colors">
            <CardHeader className="space-y-4">
              <div className="h-11 w-11 rounded-xl bg-sand flex items-center justify-center text-[#8A5B15]">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">03 // CALIBRATED</span>
                <CardTitle className="mt-1 text-base font-display">Level-Matched Difficulty</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed">
              Continuous numeric difficulty adjustment clamped within target seniority profiles. Mid stays Mid; no unexpected staff-level architecture traps.
            </CardContent>
          </Card>

          {/* Card 4 - Sky */}
          <Card className="hover:border-info/40 transition-colors">
            <CardHeader className="space-y-4">
              <div className="h-11 w-11 rounded-xl bg-sky flex items-center justify-center text-info">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <span className="label-mono text-[10px]">04 // PRIVATE</span>
                <CardTitle className="mt-1 text-base font-display">Private by Design</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed">
              Facial presence and eye contact metrics run in-browser via MediaPipe WebAssembly. Only text transcripts and numeric telemetry are saved—never video.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 6. HOW IT WORKS (Numbered steps with large serif numerals 01 02 03) */}
      <section id="how-it-works" className="py-16 sm:py-28 bg-bg-subtle border-y border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="label-mono">02 // HOW IT WORKS</div>
            <h2 className="font-display text-3xl sm:text-4xl text-text font-semibold tracking-tight">
              Three Simple Steps to Real Preparation
            </h2>
            <p className="text-text-muted text-sm sm:text-base">
              No complicated setups, no credit card required, and no peer scheduling bottlenecks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Step 01 */}
            <div className="card-editorial p-6 sm:p-8 space-y-4 relative">
              <div className="font-display text-4xl sm:text-6xl text-card-border font-bold">01</div>
              <div className="space-y-2">
                <h3 className="font-display text-lg sm:text-xl text-text font-semibold">Upload Resume &amp; Choose Track</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Provide your PDF resume or enter your target engineering track (Frontend, Backend, Full Stack). The RAG chunker indexes your real technologies.
                </p>
              </div>
            </div>

            {/* Step 02 */}
            <div className="card-editorial p-6 sm:p-8 space-y-4 relative">
              <div className="font-display text-4xl sm:text-6xl text-card-border font-bold">02</div>
              <div className="space-y-2">
                <h3 className="font-display text-lg sm:text-xl text-text font-semibold">Check Devices &amp; Start Voice Session</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Run a 10-second mic and camera check. Speak naturally with the AI interviewer via WebSocket streaming, with real-time adaptive turn handling.
                </p>
              </div>
            </div>

            {/* Step 03 */}
            <div className="card-editorial p-6 sm:p-8 space-y-4 relative">
              <div className="font-display text-4xl sm:text-6xl text-card-border font-bold">03</div>
              <div className="space-y-2">
                <h3 className="font-display text-lg sm:text-xl text-text font-semibold">Get Scorecard &amp; Download PDF</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Receive a multi-dimensional assessment covering technical depth, clarity, composure, per-question feedback, and an exportable executive PDF.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. INTERVIEW EXPERIENCE SECTION (Tabbed interactive demonstration) */}
      <section className="py-16 sm:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 sm:space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="label-mono">03 // INTERVIEW EXPERIENCE</div>
          <h2 className="font-display text-3xl sm:text-4xl text-text font-semibold tracking-tight">
            Inside the Live Interview Chamber
          </h2>
          <p className="text-text-muted text-sm sm:text-base">
            Explore the specialized interfaces and sub-systems active during each technical session.
          </p>
        </div>

        {/* Tab Buttons (Horizontally scrollable on small screens) */}
        <div className="w-full overflow-x-auto pb-2 -mb-2">
          <div className="flex items-center justify-start sm:justify-center gap-2 border-b border-card-border pb-4 min-w-max px-2">
            {[
              { label: 'Voice Conversation', icon: Mic },
              { label: 'Real-Time Transcript', icon: FileText },
              { label: 'Integrity Heuristics', icon: Camera },
              { label: 'Scorecard & PDF', icon: Layers },
            ].map((tab, idx) => {
              const Icon = tab.icon;
              const isSelected = activeTab === idx;
              return (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(idx)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-medium transition-all min-h-[44px] cursor-pointer touch-manipulation ${
                    isSelected
                      ? 'bg-primary text-primary-ink shadow-sm'
                      : 'bg-card border border-card-border text-text-muted hover:text-text'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="card-editorial p-5 sm:p-10">
          {activeTab === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <Badge variant="mint">HANDS-FREE DIALOGUE</Badge>
                <h3 className="font-display text-xl sm:text-2xl text-text font-semibold">Natural Turn-Taking Voice Engine</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  Speech synthesis and recognition seamlessly hand off turns using energy-based Voice Activity Detection (VAD). You speak directly to the AI interviewer without having to click buttons between every sentence.
                </p>
                <ul className="space-y-2 text-xs text-text-muted">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> Speech rate estimation and automatic silence boundaries
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> WebSocket transport delivering instantaneous AI audio prompts
                  </li>
                </ul>
              </div>
              <div className="rounded-xl bg-deep-band p-6 text-primary-ink text-center space-y-4">
                <div className="h-16 w-16 sm:h-20 sm:w-20 mx-auto rounded-full bg-mint/20 border border-mint/40 flex items-center justify-center animate-orb-breathe">
                  <Mic className="h-7 w-7 sm:h-8 sm:w-8 text-mint" />
                </div>
                <div className="text-xs font-mono text-mint/80">SPEECH DETECTOR ACTIVE</div>
                <p className="text-xs italic text-primary-ink/90 max-w-sm mx-auto">
                  "Listening for answer completion... silence timeout automatically detects conclusion."
                </p>
              </div>
            </div>
          )}

          {activeTab === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <Badge variant="peach">LIVE CAPTIONING</Badge>
                <h3 className="font-display text-xl sm:text-2xl text-text font-semibold">Real-Time Continuous Transcript</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  Every word is stitched client-side with confidence metrics. Candidates can see captions evolve in real time, with automatic phrase consolidation and timestamping.
                </p>
                <ul className="space-y-2 text-xs text-text-muted">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> Word count and speech rate telemetry for pacing analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> Complete turn transcripts recorded for post-interview review
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-card-border bg-bg-subtle p-4 sm:p-5 font-mono text-xs space-y-3">
                <div className="flex justify-between text-text-faint border-b border-card-border pb-2">
                  <span>TRANSCRIPT STREAM // T-04:12</span>
                  <span className="text-success">98.2% CONFIDENCE</span>
                </div>
                <p className="text-text leading-relaxed">
                  <strong className="text-primary">Q:</strong> "How do you handle schema migrations without locks in high-throughput tables?"
                </p>
                <p className="text-text-muted leading-relaxed">
                  <strong className="text-accent">A:</strong> "We use expand-and-contract patterns with dual-write semantics, allowing backward compatibility..."
                </p>
              </div>
            </div>
          )}

          {activeTab === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <Badge variant="sky">ON-DEVICE VISION</Badge>
                <h3 className="font-display text-xl sm:text-2xl text-text font-semibold">Non-Verbal Composure Telemetry</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  MediaPipe Face Mesh runs at 5 Hz inside your browser to measure blink frequency, posture stability, and eye contact continuity. These signals provide objective feedback on confidence and engagement.
                </p>
                <ul className="space-y-2 text-xs text-text-muted">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> Non-intrusive: zero raw frames leave your computer
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> 30-second camera disconnect grace period with automatic pause
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-card-border bg-card p-4 sm:p-5 space-y-3">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-text-muted">VISION TELEMETRY SIGNALS</span>
                  <Badge variant="mint">MediaPipe 0.10.18</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-bg-subtle rounded-lg">
                    <div className="text-text-faint font-mono text-[10px]">EYE CONTACT</div>
                    <div className="font-display text-lg font-bold text-text">92.4%</div>
                  </div>
                  <div className="p-3 bg-bg-subtle rounded-lg">
                    <div className="text-text-faint font-mono text-[10px]">BLINK RATE</div>
                    <div className="font-display text-lg font-bold text-text">18 / min</div>
                  </div>
                  <div className="p-3 bg-bg-subtle rounded-lg">
                    <div className="text-text-faint font-mono text-[10px]">HEAD POSE</div>
                    <div className="font-display text-lg font-bold text-text">Stable</div>
                  </div>
                  <div className="p-3 bg-bg-subtle rounded-lg">
                    <div className="text-text-faint font-mono text-[10px]">VIDEO UPLOADED</div>
                    <div className="font-display text-lg font-bold text-success">0 Bytes</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <Badge variant="sand">MULTIDIMENSIONAL RUBRIC</Badge>
                <h3 className="font-display text-xl sm:text-2xl text-text font-semibold">Immediate Comprehensive Scorecard</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  Upon interview completion, the LangGraph evaluator aggregates all response turn rubrics into an executive summary with concrete strengths, weaknesses, and a downloadable PDF document.
                </p>
                <ul className="space-y-2 text-xs text-text-muted">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> Categorized scores: Technical Depth, Clarity, Composure
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary stroke-[3]" /> Exportable formatted PDF matching this editorial theme
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-card-border bg-bg-subtle p-4 sm:p-5 space-y-3">
                <div className="flex justify-between items-center text-xs font-mono text-text-muted">
                  <span>EXECUTIVE REPORT #84920</span>
                  <Badge variant="success">Strong Hire</Badge>
                </div>
                <p className="text-xs text-text leading-relaxed">
                  "Candidate demonstrated deep distributed systems architecture knowledge, articulated trade-offs between consistency and availability, and maintained calm composure throughout."
                </p>
                <div className="pt-2 border-t border-card-border flex items-center justify-between text-xs font-mono text-text-faint">
                  <span>PDF Document: Ready</span>
                  <span className="text-primary font-semibold">Download Available</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 8. PRIVACY & INTEGRITY SECTION (Honest & Technical) */}
      <section id="privacy" className="py-16 sm:py-28 bg-bg-subtle border-y border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="label-mono">04 // TRANSPARENCY &amp; DATA PRIVACY</div>
            <h2 className="font-display text-3xl sm:text-4xl text-text font-semibold tracking-tight">
              Honest Engineering, Not Surveillance
            </h2>
            <p className="text-text-muted text-sm sm:text-base">
              A transparent breakdown of how your video, voice, and resume data are processed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="space-y-2">
                <div className="h-10 w-10 rounded-xl bg-mint flex items-center justify-center text-primary">
                  <Laptop className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-display">Client-Side MediaPipe</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-text-muted leading-relaxed">
                Computer vision runs locally inside your browser via WebAssembly. No raw video frames, images, or webcam streams are ever transmitted or stored on any server.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-2">
                <div className="h-10 w-10 rounded-xl bg-peach flex items-center justify-center text-accent">
                  <Mic className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-display">Browser Speech Services</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-text-muted leading-relaxed">
                Speech recognition utilizes the standard browser Web Speech API. Only the transcribed text and numeric speech-rate metrics are saved in MongoDB.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-2">
                <div className="h-10 w-10 rounded-xl bg-sky flex items-center justify-center text-info">
                  <Lock className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-display">Full Candidate Ownership</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-text-muted leading-relaxed">
                You retain complete control of your data. Delete interview sessions, resumes, or your entire candidate account at any time with one click.
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <a
              href="/privacy"
              className="inline-flex items-center gap-1.5 text-xs text-primary font-medium underline underline-offset-4 hover:opacity-80 min-h-[44px] sm:min-h-0"
            >
              Read the full Technical Privacy Architecture <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </section>

      {/* 9. PRICING SECTION (Single Honest Free Tier) */}
      {showPricing && (
        <section className="py-16 sm:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="label-mono">05 // PRICING &amp; ACCESS</div>
            <h2 className="font-display text-3xl sm:text-4xl text-text font-semibold tracking-tight">
              100% Free for Job Seekers
            </h2>
            <p className="text-text-muted text-sm sm:text-base">
              No hidden subscriptions, no payment gateways, and no credit card required.
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="card-editorial p-6 sm:p-8 space-y-6 border-2 border-primary/20 bg-card shadow-elevated">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-2xl text-text font-bold">Standard Practice</h3>
                  <p className="text-xs text-text-muted mt-0.5">Complete technical interview suite</p>
                </div>
                <div className="text-right">
                  <span className="font-display text-3xl sm:text-4xl font-extrabold text-primary">$0</span>
                  <span className="text-xs text-text-faint font-mono block">FREE FOREVER</span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-card-border text-xs text-text-muted">
                {[
                  'Unlimited adaptive voice technical sessions',
                  'Resume parsing & RAG technology grounding',
                  'Calibrated difficulty (Junior through Staff)',
                  'On-device MediaPipe composure telemetry',
                  'Multidimensional scorecard & executive feedback',
                  'Exportable, theme-matched PDF reports',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-primary shrink-0 stroke-[2.5]" />
                    <span className="text-text">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                variant="default"
                size="lg"
                onClick={() => {
                  window.location.href = user ? '/app/setup' : '/register';
                }}
                className="w-full rounded-full min-h-[44px]"
              >
                {user ? 'Go to Simulator' : 'Start Practicing Free'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* 10. FAQ ACCORDION (8 Items) */}
      <section id="faq" className="py-16 sm:py-28 bg-bg-subtle border-t border-card-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="label-mono">06 // FREQUENTLY ASKED QUESTIONS</div>
            <h2 className="font-display text-3xl sm:text-4xl text-text font-semibold tracking-tight">
              Common Questions Answered Honestly
            </h2>
            <p className="text-text-muted text-sm sm:text-base">
              Everything you need to know about browser compatibility, models, and privacy.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: 'Which browsers are fully supported?',
                a: 'Google Chrome and Microsoft Edge (or Chromium-based browsers) are recommended because they natively support the Web Speech API and WebAssembly SIMD acceleration required for MediaPipe camera analysis.',
              },
              {
                q: 'Do I need a webcam and microphone?',
                a: 'Yes. The interview operates via voice dialogue (requiring a working microphone) and evaluates non-verbal composure heuristics (requiring a standard webcam). A device check runs before every interview to verify both.',
              },
              {
                q: 'How long does an interview session take?',
                a: 'Sessions typically run 15 minutes and include 5 to 7 targeted technical questions with follow-ups, calibrated to your selected role and seniority level.',
              },
              {
                q: 'Is my video recorded or shared with employers?',
                a: 'No. Raw camera frames are analyzed purely on-device in your browser. No video recordings, screenshots, or pixel streams are ever stored on our servers or transmitted to third parties.',
              },
              {
                q: 'Can I retake interviews and try different tracks?',
                a: 'Yes. You can take unlimited mock interviews across Frontend, Backend, Full Stack, and other tracks, experimenting with Junior, Mid, Senior, and Staff difficulty tiers.',
              },
              {
                q: 'What happens if my camera drops during an interview?',
                a: 'The system initiates a 30-second grace pause rather than aborting immediately. Once your camera is reconnected, the interview resumes exactly where you left off.',
              },
              {
                q: 'Is this simulator really 100% free?',
                a: 'Yes. There are no credit card forms, no token meters, and no paywalls. It is built as an open educational resource for technical job candidates.',
              },
              {
                q: 'What AI models power the question engine?',
                a: 'The adaptive question and evaluation flow is orchestrated with LangGraph state machines, using Google Gemini and LangChain models with RAG retrieval from your resume and engineering rubrics.',
              },
            ].map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={item.q}
                  className="card-editorial overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-semibold text-text text-sm sm:text-base hover:text-primary transition-colors min-h-[44px] cursor-pointer touch-manipulation"
                    aria-expanded={isOpen}
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-primary' : 'text-text-faint'
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 text-xs sm:text-sm text-text-muted leading-relaxed border-t border-card-border/60 pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 11. FINAL CTA BAND (Deep Forest Green Gradient) */}
      <section className="bg-deep-band text-primary-ink py-16 sm:py-28 border-t border-primary/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="label-mono text-[11px] text-mint">07 // PRACTICE WITH INTEGRITY</span>
          <h2 className="font-display text-3xl sm:text-5xl text-primary-ink leading-tight">
            Ready to test your skills in an interview that <span className="italic text-peach">listens and adapts?</span>
          </h2>
          <p className="text-mint/85 text-sm sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Upload your resume, step into the voice chamber, and get actionable engineering feedback in 15 minutes.
          </p>
          <div className="pt-4">
            <Button
              variant="default"
              size="lg"
              onClick={() => {
                window.location.href = user ? '/app/setup' : '/register';
              }}
              className="bg-bg text-primary hover:bg-card shadow-xl font-semibold px-8 py-3.5 rounded-full text-base min-h-[44px] w-full sm:w-auto"
            >
              {user ? 'Go to Interview Setup' : 'Get Started Free — No Card Required'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>
      </main>

      {/* 12. FOOTER (Dark Green) */}
      <footer className="bg-deep-1 text-primary-ink border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <LogoWordmark variant="dark" showTagline={true} />
            <p className="text-xs text-mint/70 max-w-md">
              Adaptive technical voice interviews calibrated to seniority profiles, backed by client-side computer vision telemetry and LangGraph state orchestration.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 border-t border-white/10 text-xs">
            <div className="space-y-2">
              <h5 className="font-mono uppercase tracking-wider text-mint/90 font-semibold">Simulator</h5>
              <ul className="space-y-1.5 text-mint/70">
                <li><a href="#tracks" className="hover:text-primary-ink min-h-[32px] inline-flex items-center">Available Tracks</a></li>
                <li><a href="#how-it-works" className="hover:text-primary-ink min-h-[32px] inline-flex items-center">How It Works</a></li>
                <li><a href="#features" className="hover:text-primary-ink min-h-[32px] inline-flex items-center">Features</a></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="font-mono uppercase tracking-wider text-mint/90 font-semibold">Legal &amp; Safety</h5>
              <ul className="space-y-1.5 text-mint/70">
                <li><a href="/privacy" className="hover:text-primary-ink min-h-[32px] inline-flex items-center">Privacy Architecture</a></li>
                <li><a href="/terms" className="hover:text-primary-ink min-h-[32px] inline-flex items-center">Terms of Use</a></li>
                <li><a href="#faq" className="hover:text-primary-ink min-h-[32px] inline-flex items-center">FAQ</a></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="font-mono uppercase tracking-wider text-mint/90 font-semibold">Engineering</h5>
              <ul className="space-y-1.5 text-mint/70">
                <li><span className="text-mint/50">MediaPipe Vision WASM</span></li>
                <li><span className="text-mint/50">LangGraph State Machine</span></li>
                <li><span className="text-mint/50">Continuous 0.5 Difficulty</span></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="font-mono uppercase tracking-wider text-mint/90 font-semibold">Contact</h5>
              <p className="text-mint/70">
                pvinaysimhareddy333@gmail.com
              </p>
              <p className="text-[11px] text-mint/50 font-mono mt-1">
                Version 1.0.0 (Editorial)
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-mint/60 gap-2">
            <span>© 2026 InterviewForge. All rights reserved.</span>
            <span className="font-mono text-[11px] text-mint/50 text-center sm:text-right">
              Zero Synthetic Social Proof • Privacy-First Telemetry
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
