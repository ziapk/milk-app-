import { useStore } from '../store';
import { useT } from '../i18n';

// Active / Stopped switch for a customer. Stopped customers keep their history but leave the Delivery list.
export default function ActiveSwitch({ customer }) {
  const { saveCustomer } = useStore();
  const t = useT();
  const on = customer.active;
  return (
    <button
      role="switch"
      aria-checked={on}
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => saveCustomer({ id: customer.id, active: !on })}
    >
      <span className="track"><span className="knob" /></span>
      {on ? t.active : t.inactive}
    </button>
  );
}
