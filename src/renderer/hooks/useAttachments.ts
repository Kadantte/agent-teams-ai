import { useCallback, useState } from 'react';

import {
  fileToAttachmentPayload,
  MAX_FILES,
  MAX_TOTAL_SIZE,
  validateAttachment,
} from '@renderer/utils/attachmentUtils';

import type { AttachmentPayload } from '@shared/types';

interface UseAttachmentsReturn {
  attachments: AttachmentPayload[];
  error: string | null;
  totalSize: number;
  canAddMore: boolean;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  handlePaste: (event: React.ClipboardEvent) => void;
  handleDrop: (event: React.DragEvent) => void;
}

export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);
  const [error, setError] = useState<string | null>(null);

  const totalSize = attachments.reduce((sum, a) => sum + a.size, 0);
  const canAddMore = attachments.length < MAX_FILES && totalSize < MAX_TOTAL_SIZE;

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    let batchSize = 0;
    let valid = true;
    for (const file of fileArray) {
      const validation = validateAttachment(file);
      if (!validation.valid) {
        setError(validation.error);
        valid = false;
        break;
      }
      batchSize += file.size;
    }
    if (!valid) return;

    const newPayloads: AttachmentPayload[] = [];
    for (const file of fileArray) {
      try {
        const payload = await fileToAttachmentPayload(file);
        newPayloads.push(payload);
      } catch {
        setError(`Failed to read file: ${file.name}`);
        valid = false;
        break;
      }
    }
    if (!valid) return;

    setAttachments((prev) => {
      if (prev.length + newPayloads.length > MAX_FILES) {
        setError(`Maximum ${MAX_FILES} attachments allowed`);
        return prev;
      }
      const currentTotal = prev.reduce((sum, a) => sum + a.size, 0);
      if (currentTotal + batchSize > MAX_TOTAL_SIZE) {
        setError('Total attachment size exceeds 20MB limit');
        return prev;
      }
      return [...prev, ...newPayloads];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setError(null);
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setError(null);
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        event.preventDefault();
        void addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!files?.length) return;

      const allFiles = Array.from(files);
      const imageFiles = allFiles.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        void addFiles(imageFiles);
      } else if (allFiles.length > 0) {
        setError('Only image files are supported');
      }
    },
    [addFiles]
  );

  return {
    attachments,
    error,
    totalSize,
    canAddMore,
    addFiles,
    removeAttachment,
    clearAttachments,
    handlePaste,
    handleDrop,
  };
}
