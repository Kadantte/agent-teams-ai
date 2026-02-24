import { useCallback, useEffect } from 'react';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

export const ImageLightbox = ({
  src,
  alt = 'Image',
  open,
  onClose,
}: ImageLightboxProps): React.JSX.Element | null => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm duration-150 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        className="absolute inset-0 border-0 bg-transparent p-0"
        onClick={onClose}
        aria-label="Close"
      />
      <button
        type="button"
        className="relative z-10 max-h-[85vh] max-w-[90vw] border-0 bg-transparent p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="rounded-lg object-contain shadow-2xl"
          draggable={false}
        />
      </button>
    </div>
  );
};
