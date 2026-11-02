import React, { useState } from 'react';
import { Target, Award, Gauge, Play, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient, ApiError } from '@/lib/api';
import { ResumeData } from './ResumeUploadDropzone';

export interface SessionData {
  id: string;
  user_id: string;
  resume_id?: string;
  role: string;
  seniority: 'Junior' | 'Mid' | 'Senior' | 'Lead';
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Adaptive';
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'TERMINATED';
  created_at: string;
}

interface InterviewConfiguratorProps {
  selectedResume: ResumeData | null;
  onSessionCreated: (session: SessionData) => void;
}

const PRESET_ROLES = [
  'Full Stack Engineer',
  'Frontend Engineer',
  'Backend Systems Engineer',
  'Machine Learning Engineer',
  'DevOps / Cloud Architect',
  'Engineering Manager',
];

const SENIORITIES: Array<'Junior' | 'Mid' | 'Senior' | 'Lead'> = [
  'Junior',
  'Mid',
  'Senior',
  'Lead',
];

const DIFFICULTIES: Array<'Easy' | 'Medium' | 'Hard' | 'Adaptive'> = [
  'Easy',
  'Medium',
  'Hard',
  'Adaptive',
];

export function InterviewConfigurator({
  selectedResume,
  onSessionCreated,
}: InterviewConfiguratorProps): React.ReactElement {
  const [role, setRole] = useState('Full Stack Engineer');
  const [customRole, setCustomRole] = useState('');
  const [seniority, setSeniority] = useState<'Junior' | 'Mid' | 'Senior' | 'Lead'>('Mid');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Adaptive'>('Adaptive');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const activeRole = customRole.trim() || role;

  const handleCreateSession = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const session = await apiClient.post<SessionData>('/api/v1/sessions', {
        resume_id: selectedResume?.id || null,
        role: activeRole,
        seniority,
        difficulty,
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
              <span className="label-mono text-primary text-[10px]">02 // RUNTIME PARAMETERS</span>
              <CardTitle className="text-lg text-text font-display font-bold">Interview Configuration</CardTitle>
            </div>
          </div>
          <Badge variant="outline" className="border-card-border text-text-muted bg-bg-subtle font-mono text-xs self-start sm:self-auto">
            {difficulty === 'Adaptive' ? 'LangGraph Adaptive Engine' : `${difficulty} Mode`}
          </Badge>
        </div>
        <CardDescription className="text-text-muted text-xs mt-1">
          Configure target role, experience seniority, and adaptive AI question progression.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {createError && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs">
            {createError}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
            <Target className="h-3.5 w-3.5 text-primary" />
            Target Role & Specialization
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRESET_ROLES.map((preset) => (
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

        <div className="space-y-2">
          <label className="text-xs font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
            <Award className="h-3.5 w-3.5 text-primary" />
            Target Seniority Level
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SENIORITIES.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setSeniority(tier)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border flex items-center justify-between cursor-pointer ${
                  seniority === tier
                    ? 'border-primary bg-primary text-primary-ink shadow-xs'
                    : 'border-card-border bg-card text-text-muted hover:text-text hover:bg-bg-subtle'
                }`}
              >
                <span>{tier}</span>
                {seniority === tier && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
            <Gauge className="h-3.5 w-3.5 text-primary" />
            Question Difficulty Dynamics
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DIFFICULTIES.map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficulty(diff)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border flex flex-col items-start gap-0.5 cursor-pointer ${
                  difficulty === diff
                    ? 'border-primary bg-primary text-primary-ink shadow-xs'
                    : 'border-card-border bg-card text-text-muted hover:text-text hover:bg-bg-subtle'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span>{diff}</span>
                  {difficulty === diff && <Check className="h-3 w-3 text-primary-ink" />}
                </div>
                <span className={`text-[10px] font-normal ${difficulty === diff ? 'text-primary-ink/80' : 'text-text-faint'}`}>
                  {diff === 'Adaptive'
                    ? 'State machine adjusts'
                    : diff === 'Easy'
                    ? 'Standard fundamentals'
                    : diff === 'Medium'
                    ? 'Practical scenario'
                    : 'High complexity architecture'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-card-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-text-muted space-y-0.5">
            <div>
              Ready to interview for:{' '}
              <span className="text-text font-bold">{seniority} {activeRole}</span>
            </div>
            <div>
              Resume:{' '}
              <span className="text-primary font-mono font-medium">
                {selectedResume ? selectedResume.filename : 'No resume attached (General question pool)'}
              </span>
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
