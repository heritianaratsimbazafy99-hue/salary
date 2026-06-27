#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_TEXT_FILE_BYTES = 1_000_000;

const highConfidencePatterns = [
  {
    name: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
  },
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Resend API key",
    pattern: /\bre_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "JWT-like Supabase secret",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    name: "Assigned secret value",
    pattern: /^\s*(?:export\s+)?[A-Z0-9_]*(?:API_KEY|SECRET|SERVICE_ROLE_KEY|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*["']?([^"'\s#]{12,})["']?/gim,
    valueGroup: 1,
  },
];

const ignoredPlaceholderFragments = [
  "<",
  ">",
  "example",
  "placeholder",
  "changeme",
  "change-me",
  "your_",
  "your-",
  "no-reply",
  "localhost",
];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const findings = [];

for (const file of files) {
  const content = readTextFile(file);
  if (content == null) continue;

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const matcher of highConfidencePatterns) {
      matcher.pattern.lastIndex = 0;
      let match;
      while ((match = matcher.pattern.exec(line)) != null) {
        const value = matcher.valueGroup ? match[matcher.valueGroup] : match[0];
        if (isPlaceholder(value)) continue;
        findings.push({
          file,
          line: index + 1,
          name: matcher.name,
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Potential secrets found in tracked files:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.name})`);
  }
  console.error("Rotate any real secret before pushing, then remove it from history.");
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} tracked files scanned).`);

function readTextFile(file) {
  const buffer = readFileSync(file);
  if (buffer.length > MAX_TEXT_FILE_BYTES) return null;
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return ignoredPlaceholderFragments.some((fragment) => normalized.includes(fragment));
}
