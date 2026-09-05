import pc from "picocolors";

/**
 * Centralized color/style choices so the rest of the app doesn't sprinkle
 * raw picocolors calls everywhere. Tweak the palette here and it changes
 * consistently across every screen.
 */
export const theme = {
  brand: (text: string) => pc.bold(pc.cyanBright(text)),
  title: (text: string) => pc.bold(pc.magentaBright(text)),
  heading: (text: string) => pc.bold(pc.whiteBright(text)),
  subtle: (text: string) => pc.dim(text),
  success: (text: string) => pc.green(text),
  warning: (text: string) => pc.yellow(text),
  danger: (text: string) => pc.red(text),
  info: (text: string) => pc.blueBright(text),
  accent: (text: string) => pc.cyan(text),
  user: (text: string) => pc.bold(pc.greenBright(text)),
  ai: (text: string) => pc.bold(pc.magentaBright(text)),
  command: (text: string) => pc.italic(pc.gray(text)),
};

/** Wraps plain text to a maximum line width, preserving existing paragraphs. */
export function wrapText(text: string, width = 78): string {
  return text
    .split("\n")
    .map((paragraph) => wrapParagraph(paragraph, width))
    .join("\n");
}

function wrapParagraph(paragraph: string, width: number): string {
  if (paragraph.trim().length === 0) return "";

  const words = paragraph.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (candidate.length > width) {
      if (currentLine.length > 0) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine.length > 0) lines.push(currentLine);
  return lines.join("\n");
}
