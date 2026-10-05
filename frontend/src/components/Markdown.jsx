import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/format';

// Raw HTML is not rendered (no rehype-raw), so AI-generated content can't inject markup.
function Markdown({ children, className }) {
  return (
    <div className={cn('md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {String(children || '')}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);

/** Monospace block for stdin/stdout samples - whitespace is significant. */
export function IOBlock({ label, value, tone }) {
  return (
    <div className="min-w-0">
      {label && <p className="mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>}
      <pre
        className={cn(
          'max-h-56 overflow-auto rounded-lg border bg-editor px-3 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre text-ink',
          tone === 'bad' ? 'border-rose-500/40' : tone === 'good' ? 'border-emerald-500/30' : 'border-line',
        )}
      >
        {value === '' ? <span className="text-muted italic">(empty)</span> : value}
      </pre>
    </div>
  );
}
