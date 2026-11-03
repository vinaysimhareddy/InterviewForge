import { describe, it, expect } from 'vitest';
import {
  PRODUCT_NAME,
  CONCEPTS,
  CANONICAL_LEVELS,
  CANONICAL_ROLES,
  APP_SHELL_NAV_ITEMS,
  LANDING_NAV_ITEMS,
  USER_FLOW_STEPS,
  INTERVIEW_FORM_FIELD_ORDER,
  REGISTRATION_FIELD_ORDER,
  REPORT_SECTIONS,
  DEVICE_SETUP_STEPS,
  formatPageTitle,
  normalizeLevel,
} from '../src/copy/glossary';

describe('N4: Canonical UI Naming, Order, and Taxonomy Standards (§4)', () => {
  it('enforces canonical product branding as InterviewForge', () => {
    expect(PRODUCT_NAME).toBe('InterviewForge');
    expect(CONCEPTS.PRODUCT).toBe('InterviewForge');
  });

  it('enforces canonical core concept naming', () => {
    expect(CONCEPTS.INTERVIEW).toBe('Interview');
    expect(CONCEPTS.ROLE).toBe('Role');
    expect(CONCEPTS.LEVEL).toBe('Level');
    expect(CONCEPTS.RESUME).toBe('Resume');
    expect(CONCEPTS.INTERVIEW_REVIEW).toBe('Interview Review');
    expect(CONCEPTS.READINESS_ESTIMATE).toBe('Readiness estimate');
    expect(CONCEPTS.ACTION_PLAN).toBe('Action plan');
  });

  it('enforces canonical levels list: Junior, Mid-level, Senior, Staff', () => {
    expect(CANONICAL_LEVELS).toEqual(['Junior', 'Mid-level', 'Senior', 'Staff']);
    expect(normalizeLevel('junior')).toBe('Junior');
    expect(normalizeLevel('mid')).toBe('Mid-level');
    expect(normalizeLevel('Mid-level')).toBe('Mid-level');
    expect(normalizeLevel('senior')).toBe('Senior');
    expect(normalizeLevel('staff')).toBe('Staff');
    expect(normalizeLevel('lead')).toBe('Staff');
  });

  it('enforces canonical technical roles list', () => {
    expect(CANONICAL_ROLES.length).toBeGreaterThanOrEqual(5);
    expect(CANONICAL_ROLES).toContain('Frontend Engineer');
    expect(CANONICAL_ROLES).toContain('Backend Engineer');
    expect(CANONICAL_ROLES).toContain('Full Stack Engineer');
  });

  it('enforces strict app shell navigation order: Dashboard → New Interview → My Reviews → Resume → Account', () => {
    const navLabels = APP_SHELL_NAV_ITEMS.map((item) => item.label);
    expect(navLabels).toEqual([
      'Dashboard',
      'New Interview',
      'My Reviews',
      'Resume',
      'Account',
    ]);
  });

  it('enforces landing page nav order: How it works → Features → Interview tracks → Privacy → FAQ → Sign in → Get started free', () => {
    const landingLabels = LANDING_NAV_ITEMS.map((item) => item.label);
    expect(landingLabels).toEqual([
      'How it works',
      'Features',
      'Interview tracks',
      'Privacy',
      'FAQ',
      'Sign in',
      'Get started free',
    ]);
  });

  it('enforces 5-step user flow order & exact labels: 1 Upload resume → 2 Choose role & level → 3 Check camera & microphone → 4 Interview → 5 Review', () => {
    expect(USER_FLOW_STEPS).toHaveLength(5);
    expect(USER_FLOW_STEPS[0].fullLabel).toBe('1 Upload resume');
    expect(USER_FLOW_STEPS[1].fullLabel).toBe('2 Choose role & level');
    expect(USER_FLOW_STEPS[2].fullLabel).toBe('3 Check camera & microphone');
    expect(USER_FLOW_STEPS[3].fullLabel).toBe('4 Interview');
    expect(USER_FLOW_STEPS[4].fullLabel).toBe('5 Review');
  });

  it('enforces interview configuration form field order: resume → role → level → duration → start', () => {
    expect(INTERVIEW_FORM_FIELD_ORDER).toEqual([
      'resume',
      'role',
      'level',
      'duration',
      'start',
    ]);
  });

  it('enforces candidate registration form field order: name → email → password → confirm → consent', () => {
    expect(REGISTRATION_FIELD_ORDER).toEqual([
      'name',
      'email',
      'password',
      'confirm',
      'consent',
    ]);
  });

  it('enforces report section order: Overview → Role → Question & Answer Review → Skills → Readiness → Action Plan', () => {
    const sectionLabels = REPORT_SECTIONS.map((sec) => sec.label);
    expect(sectionLabels).toEqual([
      'Overview',
      'Role',
      'Question & Answer Review',
      'Skills',
      'Readiness',
      'Action Plan',
    ]);
  });

  it('enforces device setup order: Camera → Microphone → Speaker → Liveness', () => {
    const stepLabels = DEVICE_SETUP_STEPS.map((s) => s.label);
    expect(stepLabels).toEqual(['Camera', 'Microphone', 'Speaker', 'Liveness']);
    expect(DEVICE_SETUP_STEPS[0].fullLabel).toBe('1. Camera');
    expect(DEVICE_SETUP_STEPS[1].fullLabel).toBe('2. Microphone');
    expect(DEVICE_SETUP_STEPS[2].fullLabel).toBe('3. Speaker');
    expect(DEVICE_SETUP_STEPS[3].fullLabel).toBe('4. Liveness');
  });

  it('formats page titles with Page name · InterviewForge pattern', () => {
    expect(formatPageTitle('Dashboard')).toBe('Dashboard · InterviewForge');
    expect(formatPageTitle('Hardware Setup')).toBe('Hardware Setup · InterviewForge');
    expect(formatPageTitle('Interview Review')).toBe('Interview Review · InterviewForge');
    expect(formatPageTitle('')).toBe('InterviewForge');
  });
});

