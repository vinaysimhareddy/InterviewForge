/**
 * InterviewForge Canonical Glossary & Copy Deck (§4).
 *
 * Defines canonical names, taxonomy, navigation structures, step order,
 * form-field order, report sections, and formatting standards across
 * the entire platform.
 */

export const PRODUCT_NAME = 'InterviewForge';

/**
 * Core product concepts and terminology
 */
export const CONCEPTS = {
  PRODUCT: PRODUCT_NAME,
  INTERVIEW: 'Interview',
  ROLE: 'Role',
  LEVEL: 'Level',
  RESUME: 'Resume',
  INTERVIEW_REVIEW: 'Interview Review',
  READINESS_ESTIMATE: 'Readiness estimate',
  ACTION_PLAN: 'Action plan',
} as const;

/**
 * Canonical Seniority Levels
 * Used universally across dropdowns, chips, history, reports, and PDF.
 */
export const CANONICAL_LEVELS = [
  'Junior',
  'Mid-level',
  'Senior',
  'Staff',
] as const;

export type CanonicalLevel = typeof CANONICAL_LEVELS[number];

/**
 * Normalizes legacy level variations (e.g., 'Mid', 'Lead') into canonical levels.
 */
export function normalizeLevel(level: string): CanonicalLevel {
  const clean = (level || '').trim().toLowerCase();
  if (clean === 'junior' || clean === 'entry' || clean === 'entry-level') return 'Junior';
  if (clean === 'mid' || clean === 'mid-level' || clean === 'intermediate') return 'Mid-level';
  if (clean === 'senior' || clean === 'sr') return 'Senior';
  if (clean === 'staff' || clean === 'lead' || clean === 'principal') return 'Staff';
  return 'Senior';
}

/**
 * Canonical Technical Roles
 */
export const CANONICAL_ROLES = [
  'Full Stack Engineer',
  'Frontend Engineer',
  'Backend Engineer',
  'DevOps & Cloud Engineer',
  'Data Infrastructure Engineer',
  'Mobile Engineer',
  'Machine Learning Engineer',
] as const;

export type CanonicalRole = typeof CANONICAL_ROLES[number];

/**
 * App Shell Navigation Items (Strict Canonical Order)
 * Dashboard → New Interview → My Reviews → Resume → Account
 */
export const APP_SHELL_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: '/app/dashboard' },
  { id: 'new-interview', label: 'New Interview', href: '/app/setup' },
  { id: 'my-reviews', label: 'My Reviews', href: '/app/dashboard#reviews' },
  { id: 'resume', label: 'Resume', href: '/app/dashboard#resume' },
  { id: 'account', label: 'Account', href: '/app/dashboard#account' },
] as const;

/**
 * Public Landing Navigation Items (Strict Canonical Order)
 * How it works → Features → Interview tracks → Privacy → FAQ → Sign in → Get started free
 */
export const LANDING_NAV_ITEMS = [
  { id: 'how-it-works', label: 'How it works', href: '#how-it-works' },
  { id: 'features', label: 'Features', href: '#features' },
  { id: 'tracks', label: 'Interview tracks', href: '#tracks' },
  { id: 'privacy', label: 'Privacy', href: '#privacy' },
  { id: 'faq', label: 'FAQ', href: '#faq' },
  { id: 'login', label: 'Sign in', href: '/login' },
  { id: 'register', label: 'Get started free', href: '/register' },
] as const;

/**
 * Universal User-Flow 5 Steps (Strict Canonical Order & Labels)
 * 1 Upload resume → 2 Choose role & level → 3 Check camera & microphone → 4 Interview → 5 Review
 */
export const USER_FLOW_STEPS = [
  { step: 1, label: 'Upload resume', fullLabel: '1 Upload resume', short: 'Resume' },
  { step: 2, label: 'Choose role & level', fullLabel: '2 Choose role & level', short: 'Role & Level' },
  { step: 3, label: 'Check camera & microphone', fullLabel: '3 Check camera & microphone', short: 'Hardware Check' },
  { step: 4, label: 'Interview', fullLabel: '4 Interview', short: 'Interview' },
  { step: 5, label: 'Review', fullLabel: '5 Review', short: 'Review' },
] as const;

/**
 * New Interview Setup Form Field Order
 * resume → role → level → duration → start
 */
export const INTERVIEW_FORM_FIELD_ORDER = [
  'resume',
  'role',
  'level',
  'duration',
  'start',
] as const;

/**
 * Candidate Registration Form Field Order
 * name → email → password → confirm → consent
 */
export const REGISTRATION_FIELD_ORDER = [
  'name',
  'email',
  'password',
  'confirm',
  'consent',
] as const;

/**
 * Report Section Order (Universal across Web and PDF)
 * Overview → Role → Question & Answer Review → Skills → Readiness → Action Plan
 */
export const REPORT_SECTIONS = [
  { id: 'section-overview', label: 'Overview', order: 1 },
  { id: 'section-role', label: 'Role', order: 2 },
  { id: 'section-qa', label: 'Question & Answer Review', shortLabel: 'Q&A Review', order: 3 },
  { id: 'section-skills', label: 'Skills', order: 4 },
  { id: 'section-readiness', label: 'Readiness', order: 5 },
  { id: 'section-action-plan', label: 'Action Plan', order: 6 },
] as const;

/**
 * Pre-Interview Device Setup Order (Consistently Numbered)
 * Camera → Microphone → Speaker → Liveness (gated)
 */
export const DEVICE_SETUP_STEPS = [
  { id: 'camera', stepNumber: 1, label: 'Camera', fullLabel: '1. Camera' },
  { id: 'microphone', stepNumber: 2, label: 'Microphone', fullLabel: '2. Microphone' },
  { id: 'speaker', stepNumber: 3, label: 'Speaker', fullLabel: '3. Speaker' },
  { id: 'liveness', stepNumber: 4, label: 'Liveness', fullLabel: '4. Liveness' },
] as const;

/**
 * Canonical browser page title generator
 * Pattern: `Page name · InterviewForge`
 */
export function formatPageTitle(pageName: string): string {
  if (!pageName) return PRODUCT_NAME;
  return `${pageName} · ${PRODUCT_NAME}`;
}

