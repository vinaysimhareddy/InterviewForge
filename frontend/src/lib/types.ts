/**
 * Source of truth contracts and types matching backend Pydantic models.
 */

export type DistractionFlag = 'looked_away' | 'face_missing' | 'slouching' | 'fidgeting';

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface ExpressionMetrics {
  smile: number;
  brow_furrow: number;
  mouth_open: number;
}

export interface IntegrityFlagItem {
  flag: string;
  confidence?: number;
}

export interface IntegrityPayload {
  camera_label_hash?: string;
  device_id_hash?: string;
  track_state?: string;
  resolution?: string;
  measured_fps?: number;
  frame_diff_mean?: number;
  landmark_jitter?: number;
  luminance_mean?: number;
  faces_detected?: number;
  flags?: Array<IntegrityFlagItem | string>;
  challenge?: Record<string, unknown>;
  seq?: number;
  hmac?: string;
}

export interface TelemetrySample {
  type: 'telemetry';
  t: number;                           // seconds since interview start
  eye_contact_ratio: number | null;     // 0..1 fraction looking at camera in 1s window, null if face not present
  posture_score: number | null;         // 0..1 posture quality score, null if face not present
  head_pose: HeadPose | null;
  expression: ExpressionMetrics | null;
  distraction_flags: DistractionFlag[];
  face_present: boolean;
  fps: number;
  integrity?: IntegrityPayload;
}

export interface FrameMetricSnapshot {
  timestamp: number;
  face_present: boolean;
  looking_at_camera: boolean;
  raw_posture_score: number;
  head_pose: HeadPose;
  expression: ExpressionMetrics;
  pose_keypoint_variance: number;
}

export interface CalibrationBaseline {
  neutralShoulderWidth: number;
  neutralShoulderSlope: number;
  neutralNoseY: number;
  neutralYaw: number;
  neutralPitch: number;
}

// ==============================================================================
// WebSocket Protocols (§4.2)
// ==============================================================================

export type ClientWSMessage =
  | TelemetrySample
  | { type: 'transcript_chunk'; text: string; is_final: boolean; t: number }
  | { type: 'answer_complete'; turn_id: string }
  | { type: 'end_interview'; reason?: string }
  | { type: 'ping'; timestamp?: number }
  | { type: 'pong'; timestamp?: number }
  | { type: 'challenge_result'; challenge_id: string; nonce: string; passed: boolean; score?: number }
  | { type: 'integrity_event'; event_type: string; details?: Record<string, unknown>; t?: number };

export type ServerWSMessage =
  | { type: 'session_ready'; session_id: string; message: string; hmac_key?: string; session_salt?: string }
  | { type: 'question'; turn_id: string; text: string; topic: string; difficulty: string }
  | { type: 'ack'; received_type: string; t?: number }
  | { type: 'interview_complete'; session_id: string; evaluation_id: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'ping'; timestamp?: number }
  | { type: 'pong'; timestamp?: number }
  | { type: 'pause_integrity'; reason: string; grace_seconds?: number; voice_prompt?: string }
  | { type: 'resume_integrity'; message: string }
  | { type: 'challenge'; challenge_id: string; action: string; prompt: string; nonce: string; timeout_sec?: number };

// ==============================================================================
// Domain Models (§4.4)
// ==============================================================================

export interface CandidateUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface WorkHistoryItem {
  company: string;
  title: string;
  start?: string;
  end?: string;
  highlights: string[];
}

export interface ParsedProfile {
  technical_skills: string[];
  experience_years: number;
  work_history: WorkHistoryItem[];
}

export interface ResumeRecord {
  id: string;
  user_id: string;
  filename: string;
  file_size: number;
  raw_text: string;
  parsed_profile: ParsedProfile;
  created_at: string;
}

export type SessionLifecycleStatus = 'created' | 'active' | 'completed' | 'aborted';

export interface TranscriptTurn {
  turn_id: string;
  role: 'interviewer' | 'candidate';
  text: string;
  t_start: number;
  t_end?: number;
}

export interface InterviewSessionRecord {
  id: string;
  user_id: string;
  resume_id?: string;
  job_role: string;
  target_seniority: string;
  session_status: SessionLifecycleStatus;
  transcript: TranscriptTurn[];
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface EvaluationRecord {
  id: string;
  session_id: string;
  technical_competency_score: number;
  communication_score: number;
  non_verbal_score: number;
  overall_score: number;
  dimension_breakdown: Record<string, { score: number; feedback: string }>;
  strengths: string[];
  improvements: string[];
  detailed_summary: string;
  created_at: string;
}

// ==============================================================================
// Integrity Report & Executive Scorecard (§7, R6)
// ==============================================================================

export type IntegrityVerdict = 'Verified' | 'Verified with warnings' | 'Not verified';

export interface IntegrityTimelineEvent {
  flag: string;
  timestamp: number;
  duration_sec: number;
  confidence: number;
  details?: Record<string, unknown>;
}

export interface IntegritySummary {
  verdict: IntegrityVerdict;
  integrity_score: number;
  camera_device_name: string;
  challenges_passed: number;
  challenges_failed: number;
  face_present_percentage: number;
  pauses_count: number;
  camera_loss_incidents: number;
  timeline_events: IntegrityTimelineEvent[];
  excluded_segments_count: number;
  non_verbal_excluded_note: string;
  disclaimer: string;
}

export interface QuestionCoverageItem {
  question_index: number;
  question: string;
  candidate_answer: string;
  planner_action: string;
  target_topic: string;
  source_description: string;
  sources_used?: Array<{ source: string; id?: string; title?: string; snippet?: string }>;
  difficulty_tier: number;
  difficulty_label: string;
  score?: number;
  feedback?: string;
}

export interface DifficultyProgressionPoint {
  question_index: number;
  difficulty_tier: number;
  difficulty_label: string;
  score?: number;
  change?: 'UPGRADE' | 'DOWNGRADE' | 'UNCHANGED';
}

export interface FinalReport {
  overall_score: number;
  category_scores: {
    technical: number;
    communication: number;
    composure: number;
  };
  hiring_recommendation: string;
  strengths: string[];
  weaknesses: string[];
  executive_summary: string;
  integrity_summary?: IntegritySummary;
  question_coverage?: QuestionCoverageItem[];
  difficulty_progression?: DifficultyProgressionPoint[];
}

// ==============================================================================
// Comprehensive Post-Interview Review & Readiness Report Schema (§4.2, RP2-RP4)
// ==============================================================================

export type SkillRating = 'Met' | 'Partly' | 'Not shown';
export type TurnStatus = 'answered' | 'skipped';
export type CorrectnessVerdict =
  | 'correct'
  | 'mostly'
  | 'partly'
  | 'incorrect'
  | 'not_answered'
  | 'cannot_judge';
export type SatisfactionVerdict = 'Satisfied' | 'Partly satisfied' | 'Not satisfied';
export type ConfidenceLevel = 'Low' | 'Medium' | 'High';
export type FactorImpact = '+' | '-' | 'neutral';

export interface SkillMatchItem {
  skill: string;
  evidence: string;
  rating: SkillRating;
}

export interface RoleSummary {
  title: string;
  level: string;
  purpose: string;
  expectations: string[];
  skill_match: SkillMatchItem[];
}

export interface DimensionScores {
  technical_accuracy: number;
  depth: number;
  communication: number;
  completeness: number;
  composure: number;
}

export interface TurnCounts {
  asked: number;
  answered: number;
  skipped: number;
}

export interface SessionDuration {
  planned_minutes: number;
  actual_minutes: number;
}

export interface OverviewSummary {
  summary: string;
  verdict: string;
  overall_score: number;
  dimension_scores: DimensionScores;
  counts: TurnCounts;
  duration: SessionDuration;
}

export interface TurnDimensionScores {
  technical: number;
  depth: number;
  clarity: number;
  completeness: number;
}

export interface TurnReview {
  turn_id: string;
  index: number;
  topic: string;
  difficulty: string;
  why_asked: string;
  question: string;
  answer_clean: string;
  answer_raw: string;
  stt_confidence: number;
  status: TurnStatus;
  correctness: CorrectnessVerdict;
  scores: TurnDimensionScores;
  reason: string;
  right: string[];
  missing_or_wrong: string[];
  concepts_mentioned: string[];
  concepts_missed: string[];
  model_answer: string;
  improvement_tips: string[];
  needs_verification: boolean;
  excluded: boolean;
}

export interface SatisfactionArea {
  name: string;
  verdict: SatisfactionVerdict;
  evidence: string[];
}

export interface SatisfactionSummary {
  areas: SatisfactionArea[];
  overall_statement: string;
}

export interface TopicScore {
  topic: string;
  score: number;
  question_count: number;
}

export interface CommunicationMetrics {
  avg_len_words: number;
  wpm: number;
  fillers_per_min: number;
  latency_ms: number;
  structure_notes: string;
}

export interface SkillsAnalysis {
  topic_scores: TopicScore[];
  strengths: string[];
  gaps: string[];
  communication: CommunicationMetrics;
}

export interface NonVerbalSummary {
  eye_contact_ratio: number;
  posture_score: number;
  face_presence_rate: number;
  pauses_count: number;
  advisory_note: string;
}

export interface IntegrityReportSummary {
  verdict: string;
  integrity_score: number;
  events_summary: string[];
  disclaimer: string;
}

export interface ReadinessFactor {
  name: string;
  value: string;
  weight: number;
  impact: FactorImpact;
  description: string;
}

export interface ReadinessEstimate {
  range_low: number;
  range_high: number;
  band: string;
  confidence: ConfidenceLevel;
  factors: ReadinessFactor[];
  raise_chances: string[];
  disclaimer: string;
  available: bool_or_boolean;
  advance_verdict: string;
  reason_if_unavailable?: string | null;
}

type bool_or_boolean = boolean;

export interface ActionPriority {
  priority: number;
  area: string;
  reason: string;
  study_practice: string;
  estimated_effort: string;
}

export interface DayPlanItem {
  day: number;
  title: string;
  task: string;
}

export interface NextSessionSuggestion {
  role: string;
  level: string;
  focus_topics: string[];
}

export interface ActionPlan {
  priorities: ActionPriority[];
  seven_day_plan: DayPlanItem[];
  next_session_suggestion: NextSessionSuggestion;
}

export interface InterviewReport {
  schema_version: string;
  session_id: string;
  user_id: string;
  generated_at: string;
  models_used: string[];
  resume_id?: string | null;
  role: RoleSummary;
  overview: OverviewSummary;
  turns: TurnReview[];
  satisfaction: SatisfactionSummary;
  skills: SkillsAnalysis;
  nonverbal: NonVerbalSummary;
  integrity: IntegrityReportSummary;
  readiness: ReadinessEstimate;
  action_plan: ActionPlan;
  difficulty_progression?: DifficultyProgressionPoint[];
  question_coverage?: QuestionCoverageItem[];
}

export interface ReportStatusResponse {
  session_id: string;
  status: 'not_started' | 'generating' | 'completed' | 'failed';
  step: string;
  progress: number;
  error?: string | null;
  report_id?: string | null;
}


