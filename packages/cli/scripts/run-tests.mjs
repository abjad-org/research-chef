#!/usr/bin/env node
/**
 * Cross-platform test runner entry point.
 *
 * We deliberately avoid relying on shell glob expansion (e.g.
 * `tsx --test test/**\/*.test.ts` in package.json) because glob syntax
 * support differs across shells: it works in bash/zsh with globstar-like
 * behavior on some systems, but fails in the POSIX `sh` used by GitHub
 * Actions runners and can behave inconsistently on Windows shells too.
 *
 * Instead, this script uses Node's built-in fs APIs to find every
 * `*.test.ts` file under ./test (recursively) and passes the resolved,
 * absolute list of files directly to Node's test runner. This behaves
 * identically on every OS/shell, since no glob pattern ever reaches a
 * shell for expansion.
 */
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "node:test";
import { tap } from "node:test/reporters";

// Using fileURLToPath (rather than the URL's raw .pathname) avoids a classic
// cross-platform bug: on Windows, a file:// URL's pathname starts with an
// extra leading slash before the drive letter (e.g. "/C:/Users/..."), which
// is not a valid filesystem path. fileURLToPath handles this correctly on
// every OS.
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(SCRIPTS_DIR, "..", "test");

function findTestFiles(dir) {
  const results = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      results.push(fullPath);
    }
  }

  return results;
}

const testFiles = findTestFiles(TEST_DIR);

if (testFiles.length === 0) {
  console.error(`No test files found under ${TEST_DIR}`);
  process.exit(1);
}

const stream = run({ files: testFiles });
stream.compose(tap).pipe(process.stdout);

stream.on("test:fail", () => {
  process.exitCode = 1;
});
