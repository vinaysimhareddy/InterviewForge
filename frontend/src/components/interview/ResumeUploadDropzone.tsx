import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, X, Plus, Sparkles, Briefcase } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient, ApiError } from '@/lib/api';

export interface WorkHistoryItem {
  company: string;
  title: string;
  duration?: string;
  start?: string;
  end?: string;
  description?: string;
  highlights?: string[];
}

export interface EducationItem {
  degree: string;
  institution: string;
  year?: string;
}

export interface ParsedProfileData {
  skills?: string[];
  technical_skills?: string[];
  experience_years?: number;
  work_history?: WorkHistoryItem[];
  experience?: WorkHistoryItem[];
  education?: EducationItem[];
  summary?: string;
}

export interface ResumeData {
  id: string;
  user_id?: string;
  filename: string;
  file_size: number;
  raw_text?: string;
  parsed_data?: ParsedProfileData;
  parsed_profile?: ParsedProfileData;
  created_at: string;
}

interface ResumeUploadDropzoneProps {
  onParsed: (resume: ResumeData) => void;
  selectedResume: ResumeData | null;
}

export function ResumeUploadDropzone({
  onParsed,
  selectedResume,
}: ResumeUploadDropzoneProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newSkillInput, setNewSkillInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract skills safely across both parsed_data and parsed_profile aliases
  const parsedData: ParsedProfileData = selectedResume?.parsed_data || selectedResume?.parsed_profile || {};
  const skills: string[] = (
    Array.isArray(parsedData.skills) && parsedData.skills.length > 0
      ? parsedData.skills
      : Array.isArray(parsedData.technical_skills)
      ? parsedData.technical_skills
      : []
  ).filter(Boolean);

  // Extract work history / experiences safely
  const rawExperiences = (
    Array.isArray(parsedData.experience) && parsedData.experience.length > 0
      ? parsedData.experience
      : Array.isArray(parsedData.work_history)
      ? parsedData.work_history
      : []
  );

  const experiences = rawExperiences.map((exp) => {
    const duration = exp.duration || (exp.start ? `${exp.start} - ${exp.end || 'Present'}` : undefined);
    const desc = exp.description || (Array.isArray(exp.highlights) ? exp.highlights.join('; ') : '');
    return {
      title: exp.title || 'Role',
      company: exp.company || 'Company',
      duration,
      description: desc,
    };
  });

  const summary = parsedData.summary || '';

  const handleFile = async (file: File) => {
    setUploadError(null);

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError('Only PDF documents (.pdf) are supported.');
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError('File exceeds 5MB limit. Please upload a smaller PDF resume.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const data = await apiClient.post<ResumeData>('/api/v1/resumes', formData);
      onParsed(data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to parse resume document.';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const addCustomSkill = async () => {
    if (!newSkillInput.trim() || !selectedResume) return;
    const skillName = newSkillInput.trim();
    if (skills.includes(skillName)) return;

    const updatedSkills = [...skills, skillName];
    try {
      const updated = await apiClient.patch<ResumeData>(
        `/api/v1/resumes/${selectedResume.id}`,
        { skills: updatedSkills }
      );
      onParsed(updated);
      setNewSkillInput('');
    } catch {
      onParsed({
        ...selectedResume,
        parsed_data: {
          ...parsedData,
          skills: updatedSkills,
          technical_skills: updatedSkills,
        },
      });
      setNewSkillInput('');
    }
  };

  const removeSkill = async (skillToRemove: string) => {
    if (!selectedResume) return;
    const updatedSkills = skills.filter((s) => s !== skillToRemove);
    try {
      const updated = await apiClient.patch<ResumeData>(
        `/api/v1/resumes/${selectedResume.id}`,
        { skills: updatedSkills }
      );
      onParsed(updated);
    } catch {
      onParsed({
        ...selectedResume,
        parsed_data: {
          ...parsedData,
          skills: updatedSkills,
          technical_skills: updatedSkills,
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-primary bg-mint/30 scale-[1.01]'
            : 'border-card-border bg-card/80 hover:border-primary/50 hover:bg-bg-subtle'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="p-3.5 rounded-2xl bg-mint border border-primary/20 text-primary">
            {isUploading ? (
              <span className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin block" />
            ) : (
              <Upload className="h-6 w-6" />
            )}
          </div>

          <div>
            <p className="text-base font-semibold text-text font-display">
              {isUploading ? 'Parsing Resume Structure...' : 'Drop your resume PDF here'}
            </p>
            <p className="text-xs text-text-muted mt-1">
              or <span className="text-primary font-semibold underline underline-offset-2">browse file</span> from your computer
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-text-faint">
            <span className="px-2 py-0.5 rounded bg-bg-subtle border border-card-border">PDF ONLY</span>
            <span>MAX 5MB</span>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Selected Resume Parsing Details View */}
      {selectedResume && (
        <Card className="border border-card-border bg-card shadow-sm animate-in fade-in rounded-2xl">
          <CardHeader className="pb-3 border-b border-card-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-bold text-text truncate max-w-[200px] sm:max-w-sm">
                    {selectedResume.filename}
                  </CardTitle>
                  <CardDescription className="text-[11px] text-text-muted font-mono">
                    {(selectedResume.file_size / 1024).toFixed(1)} KB • Uploaded {new Date(selectedResume.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
              </div>
              <Badge variant="success" className="gap-1 text-[10px] font-mono shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Indexed
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-4 text-xs">
            {summary && (
              <div className="space-y-1">
                <span className="font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Candidate Profile Summary
                </span>
                <p className="text-text-muted text-xs leading-relaxed bg-bg-subtle p-3 rounded-xl border border-card-border">
                  {summary}
                </p>
              </div>
            )}

            {/* Extracted Skills with Chip Tags */}
            <div className="space-y-2">
              <span className="font-semibold text-text flex items-center justify-between font-mono uppercase tracking-wider text-[11px]">
                <span>Extracted Technical Skills ({skills.length})</span>
                <span className="text-[10px] text-text-faint font-normal font-sans">Grounding Context</span>
              </span>

              {skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 border border-card-border/60 rounded-xl bg-bg-subtle/50">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono bg-card border border-card-border text-text shadow-2xs"
                    >
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="text-primary/70 hover:text-danger transition-colors cursor-pointer p-0.5"
                        aria-label={`Remove skill ${skill}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted italic">No technical skills detected yet. You can add skills manually below.</p>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Add another skill..."
                  value={newSkillInput}
                  onChange={(e) => setNewSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomSkill();
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded-xl bg-bg-subtle border border-card-border text-base sm:text-xs text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-primary min-h-[44px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addCustomSkill}
                  className="h-10 sm:h-8 text-xs text-text gap-1 border-card-border bg-card hover:bg-bg-subtle min-h-[44px] sm:min-h-0 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Skill
                </Button>
              </div>
            </div>

            {experiences.length > 0 && (
              <div className="pt-3 border-t border-card-border">
                <span className="text-xs font-semibold text-text flex items-center gap-1.5 mb-2 font-mono uppercase tracking-wider text-[11px]">
                  <Briefcase className="h-3.5 w-3.5 text-primary" />
                  Work Experience Highlights ({experiences.length})
                </span>
                <div className="space-y-2 text-xs text-text-muted">
                  {experiences.map((exp, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-text">{exp.title}</span>
                        {exp.duration && <span className="text-[11px] font-mono text-text-faint">{exp.duration}</span>}
                      </div>
                      <div className="text-accent font-medium text-[11px]">{exp.company}</div>
                      {exp.description && (
                        <p className="text-text-muted text-[11px] line-clamp-2 mt-0.5">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
