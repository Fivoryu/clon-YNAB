'use client';

export function MoneyInput({ id, label, value, onChange, required = true, placeholder = '0,00' }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label><div className="money-input"><input id={id} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} /></div></div>;
}
