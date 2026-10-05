import Editor from '@monaco-editor/react';
import { useRef } from 'react';
import { Spinner } from './ui';

function defineTheme(monaco) {
  monaco.editor.defineTheme('codemaster', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7385', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c4a1ff' },
      { token: 'string', foreground: '9ee6a0' },
      { token: 'number', foreground: 'f5b86b' },
    ],
    colors: {
      'editor.background': '#0f1218',
      'editor.lineHighlightBackground': '#161a22',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#465062',
      'editorLineNumber.activeForeground': '#aab1c0',
      'editor.selectionBackground': '#3b3566',
      'editorCursor.foreground': '#a78bfa',
      'editorIndentGuide.background1': '#1d222c',
      'editorIndentGuide.activeBackground1': '#343b4b',
      'editorWidget.background': '#13161d',
      'editorWidget.border': '#262b37',
      'scrollbarSlider.background': '#2e344288',
    },
  });
}

/**
 * Monaco editor (loaded from the jsDelivr CDN by @monaco-editor/react).
 * Ctrl/Cmd+Enter -> onRun, Ctrl/Cmd+Shift+Enter -> onSubmit.
 */
export default function CodeEditor({ value, onChange, language, onRun, onSubmit, readOnly, fontSize = 14, height = '100%' }) {
  const runRef = useRef(onRun);
  const submitRef = useRef(onSubmit);
  runRef.current = onRun;
  submitRef.current = onSubmit;

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme="codemaster"
      beforeMount={defineTheme}
      onChange={(v) => onChange?.(v ?? '')}
      loading={
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4" /> Loading editor…
        </div>
      }
      onMount={(editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => submitRef.current?.());
      }}
      options={{
        readOnly,
        fontSize,
        fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        padding: { top: 14, bottom: 14 },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'all',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        wordWrap: 'off',
      }}
    />
  );
}
