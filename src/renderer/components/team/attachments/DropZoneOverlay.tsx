import { ImagePlus } from 'lucide-react';

interface DropZoneOverlayProps {
  active: boolean;
}

export const DropZoneOverlay = ({ active }: DropZoneOverlayProps): React.JSX.Element | null => {
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-blue-400/60 bg-blue-500/10 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-1.5 text-blue-400">
        <ImagePlus size={24} />
        <span className="text-xs font-medium">Drop images here</span>
      </div>
    </div>
  );
};
