import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { BANNED_TERMS_LIST, ALLOWED_FILE_PATHS } from '../src/copy/bannedTerms';

interface ASTViolation {
  filePath: string;
  line: number;
  kind: string;
  term: string;
  text: string;
}

function getLineNumber(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function isBanned(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const term of BANNED_TERMS_LIST) {
    // Avoid false match on partial substrings like 'fragment' for 'rag' or 'program' for 'rag'
    if (term === 'rag') {
      const match = /\brag\b/i.test(text);
      if (match) return term;
    } else if (term === 'jwt') {
      const match = /\bjwt\b/i.test(text);
      if (match) return term;
    } else if (term === 'llm') {
      const match = /\bllm\b/i.test(text);
      if (match) return term;
    } else if (term === 'wasm') {
      const match = /\bwasm\b/i.test(text);
      if (match) return term;
    } else if (term === 'mongo') {
      const match = /\bmongo\b/i.test(text);
      if (match) return term;
    } else if (term === 'atlas') {
      const match = /\batlas\b/i.test(text);
      if (match) return term;
    } else if (lower.includes(term.toLowerCase())) {
      return term;
    }
  }
  return null;
}

function getAllFiles(dir: string): string[] {
  let files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name !== 'node_modules' &&
        entry.name !== 'dev' &&
        entry.name !== '__tests__' &&
        entry.name !== 'tests'
      ) {
        files = files.concat(getAllFiles(fullPath));
      }
    } else if (
      (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.includes('LatencyLab')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Banned Terminology AST Scan (§3.3)', () => {
  it('scans all in-app components and views to verify no technology names or auth terms are user-visible', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const allFiles = getAllFiles(srcDir);
    const violations: ASTViolation[] = [];

    for (const filePath of allFiles) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const isAllowed = ALLOWED_FILE_PATHS.some((allowed) =>
        normalizedPath.endsWith(allowed.replace(/\\/g, '/'))
      );
      if (isAllowed) continue;

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );

      function visit(node: ts.Node) {
        // Skip imports, exports, and type declarations
        if (
          ts.isImportDeclaration(node) ||
          ts.isImportEqualsDeclaration(node) ||
          ts.isExportDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isInterfaceDeclaration(node)
        ) {
          return;
        }

        // 1. Check JSX Text (e.g. <span>Gemini is evaluating...</span>)
        if (ts.isJsxText(node)) {
          const rawText = node.text.trim();
          if (rawText.length > 0) {
            const hit = isBanned(rawText);
            if (hit) {
              violations.push({
                filePath: normalizedPath,
                line: getLineNumber(sourceFile, node.getStart()),
                kind: 'JsxText',
                term: hit,
                text: rawText,
              });
            }
          }
        }

        // 2. Check JSX Attributes (e.g. aria-label="...", title="...", placeholder="...")
        if (ts.isJsxAttribute(node) && node.initializer) {
          const attrName = node.name.text;
          const userVisibleAttrs = [
            'aria-label',
            'aria-description',
            'title',
            'placeholder',
            'alt',
            'label',
            'helpertext',
            'errormessage',
          ];
          if (userVisibleAttrs.includes(attrName.toLowerCase())) {
            let attrVal = '';
            if (ts.isStringLiteral(node.initializer)) {
              attrVal = node.initializer.text;
            } else if (
              ts.isJsxExpression(node.initializer) &&
              node.initializer.expression &&
              ts.isStringLiteral(node.initializer.expression)
            ) {
              attrVal = node.initializer.expression.text;
            }
            if (attrVal) {
              const hit = isBanned(attrVal);
              if (hit) {
                violations.push({
                  filePath: normalizedPath,
                  line: getLineNumber(sourceFile, node.getStart()),
                  kind: `JsxAttribute[${attrName}]`,
                  term: hit,
                  text: attrVal,
                });
              }
            }
          }
        }

        // 3. Check String Literals inside JSX Children
        if (
          (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
          node.parent &&
          (ts.isJsxExpression(node.parent) || ts.isJsxElement(node.parent))
        ) {
          const strVal = node.text.trim();
          const hit = isBanned(strVal);
          if (hit) {
            violations.push({
              filePath: normalizedPath,
              line: getLineNumber(sourceFile, node.getStart()),
              kind: 'JsxStringLiteral',
              term: hit,
              text: strVal,
            });
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    if (violations.length > 0) {
      const summary = violations
        .map(
          (v) =>
            `  • ${v.filePath}:${v.line} [${v.kind}] Banned term '${v.term}': "${v.text}"`
        )
        .join('\n');
      expect.fail(
        `Found ${violations.length} user-facing banned terminology violations:\n${summary}`
      );
    }

    expect(violations.length).toBe(0);
  });
});

