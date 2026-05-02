import type { ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
}

interface TabBarProps<T extends string> {
  active: T;
  items: TabItem<T>[];
  onChange: (id: T) => void;
}

export function TabBar<T extends string>({ active, items, onChange }: TabBarProps<T>) {
  return (
    <nav className="tab-bar">
      {items.map(item => (
        <button
          key={item.id}
          data-ro-allow
          className={`tab${active === item.id ? ' active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.badge !== undefined && <span className="badge">{item.badge}</span>}
        </button>
      ))}
    </nav>
  );
}
