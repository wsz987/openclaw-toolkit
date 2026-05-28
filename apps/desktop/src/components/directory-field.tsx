type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPick: () => Promise<void>;
  placeholder?: string;
};

export function DirectoryField({ label, value, onChange, onPick, placeholder }: Props) {
  return (
    <label>
      <span>{label}</span>
      <div className="directory-field">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
        <button type="button" className="secondary" onClick={onPick}>选择</button>
      </div>
    </label>
  );
}
