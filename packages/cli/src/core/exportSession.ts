import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "../types/index.js";

const EXPORT_DIR_NAME = ".research-chef/exports";

/** Where exported research sessions are written, by default. */
export function getExportDirectory(): string {
  return join(homedir(), EXPORT_DIR_NAME);
}

/**
 * Writes the given conversation history to a Markdown file and returns the
 * full path of the file that was written. Defaults to the export directory
 * under the user's home folder; a different directory can be passed in
 * (used by tests to avoid touching the real filesystem outside a temp dir).
 */
export async function exportSessionToMarkdown(
  topic: string,
  history: ChatMessage[],
  exportDir: string = getExportDirectory(),
): Promise<string> {
  await mkdir(exportDir, { recursive: true });

  const fileName = buildFileName(topic);
  const filePath = join(exportDir, fileName);
  const content = renderMarkdown(topic, history);

  await writeFile(filePath, content, "utf-8");
  return filePath;
}

/** Builds a filesystem-safe, human-readable file name for a research topic. */
export function buildFileName(topic: string, now: Date = new Date()): string {
  const slug = slugify(topic) || "research-session";
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `${slug}-${timestamp}.md`;
}

/** Converts arbitrary text into a lowercase, hyphenated, filesystem-safe slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Renders the conversation history as a readable Markdown document. */
export function renderMarkdown(topic: string, history: ChatMessage[], now: Date = new Date()): string {
  const lines: string[] = [];

  lines.push(`# Research session: ${topic}`);
  lines.push("");
  lines.push(`_Exported on ${now.toLocaleString()}_`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const message of history) {
    if (message.role === "user") {
      lines.push("## You");
    } else {
      lines.push("## AI");
    }
    lines.push("");
    lines.push(message.content);
    lines.push("");
  }

  return lines.join("\n");
}