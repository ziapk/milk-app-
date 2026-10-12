import { useState } from 'react';
import { useT } from '../i18n';
import { shareImage } from '../bill';
import Icon from '../Icon';

// Full-screen preview of a generated image, so it can be checked before sharing.
export default function ImagePreview({ canvas, fileName, title, onClose, header, children }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      await shareImage(canvas, fileName, title);
    } catch {
      // Closing the share sheet without picking an app also lands here.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="preview">
      {header}
      <div className="preview-img">
        <img src={canvas.toDataURL('image/png')} alt={title} />
      </div>
      <div className="preview-bar">
        <button className="btn blue solid" onClick={share} disabled={busy}>
          <Icon name={busy ? 'spinner' : 'share-nodes'} spin={busy} /> {t.share}
        </button>
        {children}
        <button className="btn" onClick={onClose}><Icon name="xmark" /> {t.close}</button>
      </div>
    </div>
  );
}
