import type { ImageAsset, ImageWork } from '../model';

interface SwitchDialogProps {
  currentName: string;
  currentVariants: number;
  currentHasSubject: boolean;
  currentCropTouched: boolean;
  next: ImageAsset;
  restores: ImageWork | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SwitchDialog({ currentName, currentVariants, currentHasSubject, currentCropTouched, next, restores, onConfirm, onCancel }: SwitchDialogProps) {
  const kept: string[] = [];
  if (currentVariants > 0) kept.push(`${currentVariants} 个裁切方案`);
  if (currentHasSubject) kept.push('主体标记');
  if (currentCropTouched) kept.push('调整过的裁切画框');
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="switch-dialog" role="alertdialog" aria-modal="true" aria-labelledby="switch-dialog-title">
        <p className="eyebrow">SWITCH IMAGE</p>
        <h2 id="switch-dialog-title">切换到「{next.name}」？</h2>
        <div className="dialog-summary">
          <p>当前图片「{currentName}」上有{kept.join('、')}。这些内容会保留在它名下，之后切回时自动恢复，不会丢失。</p>
          <ul>
            <li>辅助层设置会延续到新图片</li>
            <li>方案列表、底部计数与主体提示将显示新图片自己的状态</li>
            {restores && <li>「{next.name}」之前留有裁切进度，切换后自动恢复</li>}
          </ul>
        </div>
        <div className="dialog-actions">
          <button className="quiet-button" onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={onConfirm}>切换图片</button>
        </div>
      </div>
    </div>
  );
}
