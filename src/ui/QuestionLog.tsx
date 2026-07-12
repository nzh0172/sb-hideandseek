/** Fixed-size scrollable question log with optional map peeks.
 * Avoid React lists/keys — the in-game renderer prints keys as visible text.
 */

import type { QueryLogEntry } from '../game/types';
import { ForceText } from './ForceText';

interface QuestionLogProps {
  entries: QueryLogEntry[];
}

function formatLogText(entries: QueryLogEntry[]): string {
  if (entries.length === 0) return 'No questions yet.';
  return [...entries]
    .reverse()
    .map((entry) => `${entry.question}\nAnswer: ${entry.answer}`)
    .join('\n\n');
}

function fillPeekImages(el: HTMLDivElement | null, entries: QueryLogEntry[]): void {
  if (!el) return;
  el.replaceChildren();

  const peeks = [...entries]
    .reverse()
    .map((entry) => entry.imageDataUrl)
    .filter((url): url is string => Boolean(url));

  for (const url of peeks) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Map near hide';
    Object.assign(img.style, {
      width: '100%',
      maxHeight: '140px',
      objectFit: 'cover',
      borderRadius: '6px',
      border: '1px solid rgba(128,128,128,0.35)',
      display: 'block',
    });
    el.appendChild(img);
  }
}

export function QuestionLog({ entries }: QuestionLogProps) {
  const empty = entries.length === 0;
  const logText = formatLogText(entries);
  const hasImage = entries.some((e) => Boolean(e.imageDataUrl));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <ForceText
        text="Question log"
        as="div"
        style={{ fontSize: '11px', fontWeight: 600 }}
      />
      <div
        style={{
          height: hasImage ? '240px' : '88px',
          minHeight: hasImage ? '240px' : '88px',
          maxHeight: hasImage ? '240px' : '88px',
          overflowY: 'auto',
          overflowX: 'hidden',
          border: '1px solid rgba(128,128,128,0.4)',
          borderRadius: '6px',
          padding: '6px 8px',
          flexShrink: 0,
          fontSize: '11px',
          lineHeight: 1.4,
          color: 'var(--foreground, #111827)',
          background: 'rgba(128,128,128,0.06)',
          opacity: empty ? 0.7 : 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          ref={(el) => {
            if (el) el.textContent = logText;
          }}
          style={{ whiteSpace: 'pre-wrap' }}
        />
        <div
          ref={(el) => fillPeekImages(el, entries)}
          style={{
            display: hasImage ? 'flex' : 'none',
            flexDirection: 'column',
            gap: 8,
          }}
        />
      </div>
    </div>
  );
}
