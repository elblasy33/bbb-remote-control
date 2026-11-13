import * as React from 'react';
import { createPortal } from 'react-dom';

// Minimal self-contained dialog rendered on document.body (independent of BBB's CSS).

const C = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  } as React.CSSProperties,
  box: {
    background: '#fff', color: '#1d1d1f', borderRadius: 12, width: '100%', maxWidth: 460,
    maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,.3)',
    padding: '20px 22px', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6,
  } as React.CSSProperties,
  title: { margin: '0 0 10px', fontSize: 17, fontWeight: 700 } as React.CSSProperties,
  actions: { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' } as React.CSSProperties,
};

export const btn = (kind: 'primary' | 'secondary' | 'danger' = 'secondary'): React.CSSProperties => ({
  border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 600,
  fontSize: 14, textDecoration: 'none', display: 'inline-block',
  background: kind === 'primary' ? 'var(--color-primary, #0f70d7)' : kind === 'danger' ? '#c62828' : '#e8e8ec',
  color: kind === 'secondary' ? '#1d1d1f' : '#fff',
});

export const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
  border: '1px solid #c7c7cc', fontSize: 15, direction: 'ltr', margin: '6px 0',
};

export const code: React.CSSProperties = {
  display: 'block', direction: 'ltr', textAlign: 'left', background: '#f2f2f5', borderRadius: 6,
  padding: '6px 8px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', margin: '4px 0',
};

interface Props {
  title: string;
  rtl: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}

export function Modal({ title, rtl, children, actions, onClose }: Props): React.ReactElement {
  return createPortal(
    <div
      style={C.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div style={C.box} dir={rtl ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-label={title}>
        <h3 style={C.title}>{title}</h3>
        {children}
        {actions && <div style={C.actions}>{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function CopyField({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }):
  React.ReactElement {
  const [done, setDone] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }).catch(() => undefined);
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <code style={{ ...code, flex: 1 }}>{value}</code>
      <button type="button" style={btn()} onClick={copy}>{done ? copiedLabel : label}</button>
    </div>
  );
}
