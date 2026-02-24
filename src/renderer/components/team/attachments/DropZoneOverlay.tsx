import { ImagePlus } from 'lucide-react';

interface DropZoneOverlayProps {
  active: boolean;
}

export const DropZoneOverlay = ({ active }: DropZoneOverlayProps): React.JSX.Element | null => {
  if (!active) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed backdrop-blur-[1px]"
      style={{
        borderColor: 'var(--color-accent, #6366f1)',
        backgroundColor: 'color-mix(in srgb, var(--color-accent, #6366f1) 10%, transparent)',
      }}
    >
      <div
        className="flex flex-col items-center gap-1.5"
        style={{ color: 'var(--color-accent, #6366f1)' }}
      >
        <ImagePlus size={24} />
        <span className="text-xs font-medium">Drop images here</span>
      </div>
    </div>
  );
};
