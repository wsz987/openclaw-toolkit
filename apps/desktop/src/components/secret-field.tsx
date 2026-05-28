type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SecretField({ label, value, onChange, placeholder }: Props) {
  return (
    <label>
      <span>{label}</span>
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
