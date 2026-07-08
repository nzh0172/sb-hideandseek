/** Fixed-size scrollable question log — single text block, no list keys */

import type { QueryLogEntry } from '../game/types';
import { ForceText } from './ForceText';

interface QuestionLogProps {
  entries: QueryLogEntry[];
}

function formatLogText(entries: QueryLogEntry[]): string {
  return [...entries]
    .reverse()
    .map((entry) => `${entry.question}\nAnswer: ${entry.answer}`)
    .join('\n\n');
}

export function QuestionLog({ entries }: QuestionLogProps) {
  if (entries.length === 0) return null;

  const logText = formatLogText(entries);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <ForceText
        text="Question log"
        as="div"
        style={{ fontSize: '11px', fontWeight: 600 }}
      />
      <div
        ref={(el) => {
          if (el) el.textContent = logText;
        }}
        style={{
          height: '88px',
          minHeight: '88px',
          maxHeight: '88px',
          overflowY: 'auto',
          overflowX: 'hidden',
          border: '1px solid rgba(128,128,128,0.4)',
          borderRadius: '6px',
          padding: '6px 8px',
          flexShrink: 0,
          fontSize: '11px',
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          color: 'var(--foreground, #111827)',
          background: 'rgba(128,128,128,0.06)',
        }}
      />
    </div>
  );
}
