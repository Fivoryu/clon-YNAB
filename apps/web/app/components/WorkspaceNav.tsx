'use client';

export type WorkspaceSection = 'overview' | 'plan' | 'activity' | 'accounts' | 'history' | 'data';

const items: Array<{ id: WorkspaceSection; label: string; hint: string }> = [
  { id: 'overview', label: 'Overview', hint: 'See where you stand' },
  { id: 'plan', label: 'Plan', hint: 'Assign and move money' },
  { id: 'activity', label: 'Activity', hint: 'Record money movement' },
  { id: 'accounts', label: 'Accounts', hint: 'Manage balances' },
  { id: 'history', label: 'History', hint: 'Review and correct' },
  { id: 'data', label: 'Data', hint: 'Import or export CSV' },
];

export function WorkspaceNav({ active, onChange }: { active: WorkspaceSection; onChange: (section: WorkspaceSection) => void }) {
  return (
    <nav className="workspace-nav" aria-label="Budget workspace">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className={active === item.id ? 'nav-item active' : 'nav-item'}
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          <strong>{item.label}</strong>
          <span>{item.hint}</span>
        </button>
      ))}
    </nav>
  );
}
