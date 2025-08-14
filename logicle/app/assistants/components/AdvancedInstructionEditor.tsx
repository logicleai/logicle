import React, { useMemo, forwardRef } from 'react'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import CodeMirror, { EditorView, Extension, lineNumbers } from '@uiw/react-codemirror'
import { languages } from '@codemirror/language-data'

export type InstructionTextAreaProps = {
  className?: string
  style?: React.CSSProperties
  onChange?: (value: string) => void
  value?: string
  defaultValue?: string
  placeholder?: string
  disabled?: boolean
  name?: string
  id?: string
}

// Lightweight line-wrap + scrollable styling without extra theme colors
function useWrappingTheme(): Extension[] {
  return useMemo(
    () => [
      lineNumbers(),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
          borderRadius: '0.5rem',
          border: '1px solid var(--cm-border, rgba(0,0,0,0.12))',
          fontSize: '0.875rem',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        },
        '.cm-scroller': {
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0.5rem',
          flex: 1,
          minHeight: 0,
        },
        '.cm-content': {
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          minHeight: '100%',
        },
        '.cm-gutters': {
          backgroundColor: 'inherit',
          border: 'none',
        },
        '&.cm-focused': {
          boxShadow: '0 0 0 3px rgba(99,102,241,0.35)',
          borderColor: 'rgba(99,102,241,1)',
        },
      }),
    ],
    []
  )
}

const InstructionTextArea = forwardRef<HTMLDivElement, InstructionTextAreaProps>(
  function InstructionTextArea(
    { className, style, onChange, value, defaultValue, placeholder, disabled },
    ref
  ) {
    const wrapping = useWrappingTheme()

    return (
      <CodeMirror
        ref={ref as any}
        className={className}
        style={{ ...style }}
        height="100%"
        value={value ?? defaultValue ?? ''}
        onChange={(v) => onChange?.(v)}
        editable={!disabled}
        basicSetup={{
          lineNumbers: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: true,
          bracketMatching: true,
          history: true,
        }}
        placeholder={placeholder}
        extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), ...wrapping]}
      />
    )
  }
)

export default InstructionTextArea
