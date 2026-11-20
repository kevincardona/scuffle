import React, { useEffect } from 'react';
import './modal.scss';

export default function Modal({ title, icon, onClose, children, actions, wide = false, dismissable = true }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && dismissable && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dismissable]);
  return (
    <div className="modal__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable && onClose) onClose(); }}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        {dismissable && onClose && <button className="modal__close" aria-label="Close" onClick={onClose}>×</button>}
        {(icon || title) && (
          <header className="modal__header">
            {icon && <div className="modal__icon">{icon}</div>}
            {title && <h2>{title}</h2>}
          </header>
        )}
        <div className="modal__body">{children}</div>
        {actions && <footer className="modal__actions">{actions}</footer>}
      </div>
    </div>
  );
}
