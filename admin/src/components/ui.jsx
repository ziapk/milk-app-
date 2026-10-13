import { createContext, useCallback, useContext, useRef, useState } from 'react';

// Toasts and a promise-based confirm dialog, shared by every page.
const Ui = createContext(null);
export const useUi = () => useContext(Ui);

export function UiProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [ask, setAsk] = useState(null);
  const timer = useRef();

  const notify = useCallback((text, error = false) => {
    clearTimeout(timer.current);
    setToast({ text, error });
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // confirm({ title, text, ok, danger }) -> Promise<boolean>
  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), []);
  const answer = (yes) => {
    ask.resolve(yes);
    setAsk(null);
  };

  return (
    <Ui.Provider value={{ notify, confirm }}>
      {children}
      {ask && (
        <Modal title={ask.title} onClose={() => answer(false)}>
          <p className="muted">{ask.text}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => answer(false)}>Cancel</button>
            <button className={`btn solid ${ask.danger ? 'danger' : ''}`} onClick={() => answer(true)} autoFocus>
              {ask.ok}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className={`toast ${toast.error ? 'err' : ''}`} role="status">
          <i className={`fa-solid ${toast.error ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /> {toast.text}
        </div>
      )}
    </Ui.Provider>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, icon, tone, sub }) {
  return (
    <div className="stat">
      <div className="stat-head">
        <span>{label}</span>
        {icon && <i className={`fa-solid fa-${icon} ${tone || ''}`} />}
      </div>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Badge({ kind, children, icon }) {
  return (
    <span className={`badge ${kind}`}>
      {icon && <i className={`fa-solid fa-${icon}`} />} {children}
    </span>
  );
}
