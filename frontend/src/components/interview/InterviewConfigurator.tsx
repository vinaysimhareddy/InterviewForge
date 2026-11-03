import React, { useState } from 'react';
import { Target, Award, Play, Check, Sparkles, Clock, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient, ApiError } from '@/lib/api';
import { ResumeData } from './ResumeUploadDropzone';
import { CANONICAL_ROLES, CANONICAL_LEVELS, CanonicalLevel, normalizeLevel } from '@/copy/glossary';

export interface SessionData {
  id: string;
  user_id: string;
  resume_id?: string;
  role: string;
  seniority: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Adaptive';
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'TERMINATED';
  created_at: string;
}

export interface InterviewConfiguratorProps {
  selectedResume: ResumeData | null;
  onSessionCreated: (session: SessionData) => void;
  initialRole?: string;
  initialSeniority?: string;
  focusTopics?: string[];
}

const DURATIONS = [15, 20, 30, 45] as const;

export function InterviewConfigurator({
  selectedResume,
  onSessionCreated,
  initialRole,
  initialSeniority,
  focusTopics,
}: InterviewConfiguratorProps): React.ReactElement {
  const [role, setRole] = useState(initialRole || CANONICAL_ROLES[0]);
  const [customRole, setCustomRole] = useState('');
  const [level, setLevel] = useState<CanonicalLevel>(
    normalizeLevel(initialSeniority || 'Senior')
  );
  const [duration, setDuration] = useState<number>(20);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialRole) {
      if ((CANONICAL_ROLES as readonly string[]).includes(initialRole)) {
        setRole(initialRole);
        setCustomRole('');
      } else {
        setCustomRole(initialRole);
      }
    }
  }, [initialRole]);

  React.useEffect(() => {
    if (initialSeniority) {
      setLevel(normalizeLevel(initialSeniority));
    }
  }, [initialSeniority]);

  const activeRole = customRole.trim() || role;

  const handleCreateSession = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const session = await apiClient.post<SessionData>('/api/v1/sessions', {
        resume_id: selectedResume?.id || null,
        role: activeRole,
        seniority: level,
        difficulty: 'Adaptive',
        duration_minutes: duration,
      });
      onSessionCreated(session);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to initialize session.';
      setCreateError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className="card-editorial shadow-sm backdrop-blur-md">
      <CardHeader className="border-b border-card-border pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-peach border border-accent/20 flex items-center justify-center text-accent">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <span className="label-mono text-primary text-[10px]">02 // STEP 2: CHOOSE ROLE & LEVEL</span>
              <CardTitle className="text-lg text-text font-display font-bold">Interview Configuration</CardTitle>
            </div>
          </div>
          <Badge variant="outline" className="border-card-border text-text-muted bg-bg-subtle font-mono text-xs self-start sm:self-auto">
            Adaptive Question Flow
          </Badge>
        </div>
        <CardDescription className="text-text-muted text-xs mt-1">
          Configure target role, experience level, and planned interview duration.
        </CardDescription>
      </CardHeader>

      {/* Form field order: resume → role → level → duration → start */}
      <CardContent className="space-y-6 pt-6">
        {createError && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs">
            {createError}
          </div>
        )}

        {/* 1. Resume Indicator */}
        <div className="p-3 rounded-xl bg-bg-subtle border border-card-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs text-text-muted">1. Attached Resume:</span>
            <span className="text-xs font-semibold text-text truncate max-w-[200px] sm:max-w-xs">
              {selectedResume ? selectedResume.filename : 'No resume attached (General questions)'}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono border-card-border">
            {selectedResume ? 'Grounded' : 'Standard'}
          </Badge>
        </div>

        {focusTopics && focusTopics.length > 0 && (
          <div className="p-3.5 rounded-xl bg-mint/50 border border-primary/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Target Focus Areas (From Previous Review)
              </span>
              <Badge variant="outline" className="text-[10px] font-mono bg-mint text-primary border-primary/30">
                Adaptive Priority
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {focusTopics.map((topic) => (
                <Badge
                  key={topic}
                  variant="outline"
                  className="bg-card text-text font-medium text-xs border-primary/30 px-2.5 py-0.5"
                >
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 2. Role Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
            <Target className="h-3.5 w-3.5 text-primary" />
            2. Target Role & Specialization
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CANONICAL_ROLES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setRole(preset);
                  setCustomRole('');
                }}
                className={`px-3 py-2 rounded-xl text-xs font-medium text-left transition-all border cursor-pointer ${
                  activeRole === preset && !customRole
                    ? 'border-primary bg-primary text-primary-ink shadow-xs'
                    : 'border-card-border bg-card text-text-muted hover:text-text hover:bg-bg-subtle'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="pt-1">
            <input
              type="text"
              placeholder="Or enter custom role (e.g. Site Reliability Engineer)"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-bg-subtle border border-card-border text-xs text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* 3. Level Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
            <Award className="h-3.5 w-3.5 text-primary" />
            3. Experience Level
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CANONICAL_LEVELS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setLevel(tier)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border flex items-center justify-between cursor-pointer ${
                  level === tier
                    ? 'border-primary bg-primary text-primary-ink shadow-xs'
                    : 'border-card-border bg-card text-text-muted hover:text-text hover:bg-bg-subtle'
                }`}
              >
                <span>{tier}</span>
                {level === tier && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Duration Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
            <Clock className="h-3.5 w-3.5 text-primary" />
            4. Interview Duration
          </label>
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => setDuration(dur)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border text-center cursor-pointer ${
                  duration === dur
                    ? 'border-primary bg-primary text-primary-ink shadow-xs'
                    : 'border-card-border bg-card text-text-muted hover:text-text hover:bg-bg-subtle'
                }`}
              >
                {dur} min
              </button>
            ))}
          </div>
        </div>

        {/* 5. Start / Summary */}
        <div className="pt-4 border-t border-card-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-text-muted space-y-0.5">
            <div>
              Ready to interview for:{' '}
              <span className="text-text font-bold">{level} {activeRole}</span>
            </div>
            <div>
              Duration:{' '}
              <span className="text-text font-medium">{duration} min</span>
            </div>
          </div>

          <Button
            onClick={handleCreateSession}
            disabled={isCreating}
            className="w-full sm:w-auto h-11 px-6 bg-primary hover:bg-primary-hover text-primary-ink font-semibold rounded-xl shadow-md gap-2 shrink-0 cursor-pointer"
          >
            {isCreating ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-primary-ink/30 border-t-primary-ink rounded-full animate-spin" />
                Initializing...
              </span>
            ) : (
              <>
                <Play className="h-4 w-4 fill-primary-ink text-primary-ink" />
                Start Live Interview
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
