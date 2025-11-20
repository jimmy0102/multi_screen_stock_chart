import React from 'react';
import type { HorizontalLineSettings } from '../../lib/types';

interface HorizontalLineToolbarProps {
  isActive: boolean;
  onToggle: () => void;
  settings: HorizontalLineSettings;
  onChange: (settings: HorizontalLineSettings) => void;
}

const PRESET_COLORS = [
  { label: 'レジスタンス（強）', value: '#FF0000' },
  { label: 'レジスタンス（弱）', value: '#FF7F7F' },
  { label: 'リスク注意', value: '#FF6F61' },
  { label: 'サポート（強）', value: '#0055FF' },
  { label: 'サポート（弱）', value: '#5DA9FF' },
  { label: 'トレンドライン', value: '#6A5ACD' },
  { label: '注目ライン', value: '#00B894' },
  { label: 'ブレイク候補', value: '#F39C12' },
  { label: '押し目ライン', value: '#2ECC71' },
  { label: '戻り売りライン', value: '#E84393' },
  { label: '監視ライン', value: '#6C757D' },
  { label: 'カスタム', value: '#808080' }
];

export const HorizontalLineToolbar: React.FC<HorizontalLineToolbarProps> = ({
  isActive,
  onToggle,
  settings,
  onChange
}) => {
  return (
    <div className="horizontal-line-toolbar">
      <button
        className={`hl-toggle ${isActive ? 'active' : ''}`}
        onClick={onToggle}
      >
        {isActive ? 'キャンセル' : '水平線を追加'}
      </button>

      <div className="hl-colors" title="新しい水平線の色">
        {PRESET_COLORS.map(({ label, value }) => (
          <button
            key={value}
            className={`hl-color ${settings.color === value ? 'selected' : ''}`}
            style={{ backgroundColor: value }}
            onClick={() => onChange({ ...settings, color: value })}
            title={label}
          />
        ))}
      </div>

      <div className="hl-width" title="新しい水平線の太さ">
        <label htmlFor="hl-width-slider">太さ: {settings.width}px</label>
        <input
          id="hl-width-slider"
          type="range"
          min={1}
          max={8}
          value={settings.width}
          onChange={(event) => onChange({ ...settings, width: Number(event.target.value) })}
        />
      </div>
    </div>
  );
};

export default HorizontalLineToolbar;
