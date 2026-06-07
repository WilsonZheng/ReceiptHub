import { useState } from 'react';
import { useT } from '../../lib/i18n';

/** 组尾"＋"占位 chip：点击就地变输入框，Enter/失焦提交，Esc 取消（设置/拍照/详情共用） */
export function AddChip({ onAdd }: { onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const t = useT();

  function commit() {
    const name = value.trim();
    if (name) onAdd(name);
    setValue('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded-full border border-dashed px-2.5 py-1 text-xs"
        style={{
          borderColor: 'var(--color-ink-muted)',
          color: 'var(--color-ink-muted)',
          background: 'transparent',
        }}
      >
        ＋ {t('add')}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setValue('');
          setEditing(false);
        }
      }}
      placeholder={t('newCategory')}
      className="w-32 rounded-full px-2.5 py-1 text-xs"
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-accent)',
        outline: 'none',
        color: 'var(--color-ink)',
      }}
    />
  );
}
