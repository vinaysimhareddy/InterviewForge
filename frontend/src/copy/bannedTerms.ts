/**
 * Banned terminology configuration for automated hygiene enforcement (§3.3).
 *
 * Terms in this list must NEVER appear in user-facing text, page titles,
 * tooltips, dialogs, toasts, error messages, or DOM elements inside the app.
 *
 * Allowed exceptions:
 * - Public marketing landing page (LandingPage.tsx)
 * - Legal disclosure pages (PrivacyPage.tsx, TermsPage.tsx)
 * - Internal code identifiers, imports, and type definitions (not user-facing strings)
 */

export const BANNED_TERMS_LIST = [
  'gemini',
  'openai',
  'gpt',
  'langgraph',
  'langchain',
  'nemotron',
  'nemo',
  'mediapipe',
  'wasm',
  'mongodb',
  'mongo',
  'atlas',
  'fastapi',
  'argon',
  'argon2',
  'jwt',
  'hmac',
  'rag',
  'embedding',
  'vector search',
  'llm',
  'web speech',
  'bearer ',
] as const;

export const ALLOWED_FILE_PATHS = [
  'pages/LandingPage.tsx',
  'pages/PrivacyPage.tsx',
  'pages/TermsPage.tsx',
  'copy/terms.ts',
  'copy/bannedTerms.ts',
  'copy/glossary.ts',
] as const;

export function containsBannedTerm(text: string): { found: boolean; term?: string } {
  if (!text) return { found: false };
  const lower = text.toLowerCase();
  for (const term of BANNED_TERMS_LIST) {
    // Check word-boundary or substring match
    if (lower.includes(term.toLowerCase())) {
      return { found: true, term };
    }
  }
  return { found: false };
}

