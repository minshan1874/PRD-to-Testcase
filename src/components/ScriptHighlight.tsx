import type { ReactNode } from "react";

const ROBOT_KEYWORDS = [
  "Wait Until Element Is Visible",
  "Page Should Contain",
  "Element Should Be Visible",
  "Input Password",
  "Input Text",
  "Click Element",
  "Open Browser",
  "Close All Browsers",
  "Close Browser",
  "Go To",
  "Sleep",
];

const keywordPattern = new RegExp(
  `(\\$\\{[^}]+\\}|${ROBOT_KEYWORDS.map(escapeRegExp).sort((a, b) => b.length - a.length).join("|")})`,
  "g",
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightCode(code: string): ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, lineIndex) => {
    const trimmed = line.trim();
    let content: ReactNode;

    if (/^\*{3}.*\*{3}$/.test(trimmed)) {
      content = <span className="text-sky-300">{line}</span>;
    } else {
      const commentIndex = line.indexOf("#");
      const source = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
      const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
      const parts: ReactNode[] = [];
      let lastIndex = 0;

      if (/^\s*Library\s+SeleniumLibrary(?:\s|$)/.test(source)) {
        const match = source.match(/^(\s*)(Library)(\s+)(SeleniumLibrary.*)$/);
        if (match) {
          parts.push(match[1]);
          parts.push(<span key="library" className="text-violet-300">{match[2]}</span>);
          parts.push(match[3]);
          parts.push(<span key="selenium" className="text-emerald-300">{match[4]}</span>);
          lastIndex = source.length;
        }
      }

      if (lastIndex === 0) {
        for (const match of source.matchAll(keywordPattern)) {
          const index = match.index ?? 0;
          if (index > lastIndex) parts.push(source.slice(lastIndex, index));
          const token = match[0];
          const isVariable = token.startsWith("${");
          parts.push(
            <span key={`${token}-${index}`} className={isVariable ? "text-amber-300" : "text-violet-300"}>
              {token}
            </span>,
          );
          lastIndex = index + token.length;
        }
        if (lastIndex < source.length) parts.push(source.slice(lastIndex));
      }

      if (comment) parts.push(<span className="text-muted-foreground/80">{comment}</span>);
      content = parts.length > 0 ? parts : line;
    }

    return (
      <span key={lineIndex} className="block min-h-[1.4em]">
        {content}
      </span>
    );
  });
}

export default function ScriptHighlight({ code }: { code: string }) {
  return (
    <pre className="max-h-[min(60vh,34rem)] overflow-auto rounded-md border bg-slate-950/95 p-4 font-mono text-sm leading-relaxed text-slate-200">
      <code>{highlightCode(code)}</code>
    </pre>
  );
}
