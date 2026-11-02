import React from 'react';
import { ArrowLeft, ShieldCheck, Cpu, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LogoWordmark } from '@/components/common/LogoWordmark';

export default function PrivacyPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent-soft selection:text-accent font-sans">
      {/* Top Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/85 border-b border-card-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="hover:opacity-90 transition-opacity">
            <LogoWordmark />
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = '/';
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <div className="space-y-3">
          <div className="label-mono">POLICY // TRANSPARENCY & INTEGRITY</div>
          <h1 className="font-display text-4xl sm:text-5xl text-text tracking-tight">
            Privacy Policy & Data Architecture
          </h1>
          <p className="text-text-muted text-base leading-relaxed">
            Last updated: November 2026. This platform is engineered around a strict privacy-first architecture. Here is an honest, technical explanation of what runs on your device, what is transmitted, and what is stored.
          </p>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="space-y-2">
              <div className="h-10 w-10 rounded-xl bg-mint flex items-center justify-center text-primary">
                <Cpu className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-xl">100% On-Device Vision</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-text-muted leading-relaxed">
              Webcam video feeds are processed entirely inside your local browser via MediaPipe WebAssembly. No video frames, photographs, or raw pixel streams are ever transmitted, saved, or uploaded to our servers or third parties.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <div className="h-10 w-10 rounded-xl bg-sky flex items-center justify-center text-info">
                <HardDrive className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-xl">What We Store</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-text-muted leading-relaxed">
              We persist only textual data and numeric signals: candidate accounts, parsed resume skill chunks, textual question and answer transcripts, and aggregated telemetry metrics (e.g. eye contact percentage and blink frequency).
            </CardContent>
          </Card>
        </div>

        {/* Detailed Sections */}
        <section className="space-y-8 text-sm leading-relaxed text-text-muted border-t border-card-border pt-8">
          <div className="space-y-3">
            <h2 className="font-display text-2xl text-text font-semibold">1. Speech Recognition & Browser Services</h2>
            <p>
              Voice responses are transcribed using the browser's standard Web Speech API. When using Chromium-based browsers (Google Chrome, Microsoft Edge, Brave), speech audio is processed by Google's browser speech recognition cloud service according to their browser privacy policies. We do not store raw microphone audio recordings on our servers.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-2xl text-text font-semibold">2. Camera & Integrity Telemetry Heuristics</h2>
            <p>
              Integrity checks (face presence, eye gaze continuity, lighting stability) are advisory heuristics designed to simulate professional interview presence. They are computed locally at 5 Hz and summarized into numeric averages. They do not constitute formal identity proof or employment surveillance.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-2xl text-text font-semibold">3. Resume & Question Grounding (RAG)</h2>
            <p>
              When you upload a resume, it is parsed into semantic text chunks and embedded into high-dimensional vectors stored in MongoDB Atlas. These vectors are strictly partitioned by your candidate ID (<code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-text">user_id</code>) and are utilized solely to retrieve contextually relevant questions for your mock session.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-2xl text-text font-semibold">4. Data Retention & Deletion</h2>
            <p>
              You retain full ownership of your interview data. You can delete individual interview sessions, uploaded resumes, or your entire account at any time from your settings or by contacting <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-text">support@adaptivemock.local</code>. Upon deletion, all associated transcripts, embeddings, and scorecards are permanently purged from the database.
            </p>
          </div>
        </section>

        {/* Bottom Banner */}
        <div className="card-editorial p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-mint flex items-center justify-center text-success shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-text text-sm">Privacy by Design</h4>
              <p className="text-xs text-text-muted">Strict adherence to local telemetry and candidate ownership.</p>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Return to Simulator
          </Button>
        </div>
      </main>
    </div>
  );
}
