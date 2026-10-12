import Icon from '../Icon';

const STEP = 10;

export default function AmountInput({ value, onChange, autoFocus }) {
  const n = Number(value) || 0;
  return (
    <div className="amount" dir="ltr">
      <button type="button" className="round" onClick={() => onChange(String(Math.max(0, n - STEP)))}><Icon name="minus" /></button>
      <input
        className="huge"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        inputMode="numeric"
        autoFocus={autoFocus}
      />
      <button type="button" className="round" onClick={() => onChange(String(n + STEP))}><Icon name="plus" /></button>
    </div>
  );
}
