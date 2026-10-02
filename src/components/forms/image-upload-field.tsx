"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  IMAGE_UPLOAD_ACCEPT_ATTRIBUTE,
  getImageTooLargeMessage,
  validateImageUploadFile
} from "@/lib/image-upload-rules";

type ImageUploadFieldProps = {
  name: string;
  label: string;
  required?: boolean;
  helperText?: string;
  inputClassName?: string;
  existingImageDataUrl?: string | null;
  existingFileName?: string | null;
  onPreviewChange?: (url: string | null) => void;
  previewImageClassName?: string;
  requiredStatusFieldName?: string;
  requiredStatusValues?: string[];
  requiredMessage?: string;
  disabledStatusFieldName?: string;
  disabledStatusValues?: string[];
  disabledMessage?: string;
  maxBytes?: number;
  compressBeforeUpload?: boolean;
  compressionTargetBytes?: number;
  compressionMaxWidth?: number;
  compressionMimeType?: "image/jpeg" | "image/webp";
};

const DEFAULT_INPUT_CLASS =
  "bpma-input";

function getCompressedFileName(fileName: string, mimeType: string): string {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = (dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName).trim();

  return `${baseName || "foto"}-otimizada.${extension}`;
}

function loadImage(file: File): Promise<{ image: HTMLImageElement; cleanup: () => void }> {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => resolve({ image, cleanup });
    image.onerror = () => {
      cleanup();
      reject(new Error("Não foi possível otimizar esta imagem. Selecione outra foto."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/webp",
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Não foi possível otimizar esta imagem. Selecione outra foto."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

async function compressImageFile(
  file: File,
  options: {
    maxBytes: number;
    targetBytes: number;
    maxWidth: number;
    mimeType: "image/jpeg" | "image/webp";
  }
): Promise<File> {
  const { image, cleanup } = await loadImage(file);

  try {
    const scale = Math.min(1, options.maxWidth / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    if (file.size <= options.targetBytes && scale >= 1) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Não foi possível otimizar esta imagem. Selecione outra foto.");
    }

    if (options.mimeType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }

    context.drawImage(image, 0, 0, width, height);

    const qualityCandidates = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];
    let bestBlob: Blob | null = null;

    for (const quality of qualityCandidates) {
      const blob = await canvasToBlob(canvas, options.mimeType, quality);
      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }
      if (blob.size <= options.targetBytes || blob.size <= options.maxBytes) {
        bestBlob = blob;
        break;
      }
    }

    if (!bestBlob || bestBlob.size > options.maxBytes) {
      throw new Error(getImageTooLargeMessage(options.maxBytes));
    }

    return new File([bestBlob], getCompressedFileName(file.name, options.mimeType), {
      type: bestBlob.type || options.mimeType,
      lastModified: Date.now()
    });
  } finally {
    cleanup();
  }
}

export function ImageUploadField({
  name,
  label,
  required = false,
  helperText,
  inputClassName = DEFAULT_INPUT_CLASS,
  existingImageDataUrl = null,
  existingFileName = null,
  onPreviewChange,
  previewImageClassName = "max-h-44 max-w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700",
  requiredStatusFieldName,
  requiredStatusValues = [],
  requiredMessage = "Anexe uma foto para continuar.",
  disabledStatusFieldName,
  disabledStatusValues = [],
  disabledMessage,
  maxBytes,
  compressBeforeUpload = false,
  compressionTargetBytes,
  compressionMaxWidth = 1280,
  compressionMimeType = "image/jpeg"
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>(
    existingFileName ?? ""
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    existingImageDataUrl ?? null
  );
  const [validationError, setValidationError] = useState<string>("");
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [disabledByStatus, setDisabledByStatus] = useState(false);

  useEffect(() => { onPreviewChange?.(previewUrl); }, [onPreviewChange, previewUrl]);

  useEffect(() => {
    setPreviewUrl(existingImageDataUrl ?? null);
    setSelectedFileName(existingFileName ?? "");
    setValidationError("");
    setIsProcessingFile(false);
  }, [existingFileName, existingImageDataUrl]);

  const isDataUrlPreview = useMemo(
    () => Boolean(previewUrl?.startsWith("data:")),
    [previewUrl]
  );

  const clearSelectedFile = () => {
    const input = inputRef.current;
    if (input) {
      input.value = "";
      input.setCustomValidity("");
    }

    if (previewUrl && !previewUrl.startsWith("data:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFileName(existingFileName ?? "");
    setPreviewUrl(existingImageDataUrl ?? null);
    setValidationError("");
    setIsProcessingFile(false);
  };

  useEffect(() => {
    return () => {
      if (previewUrl && !isDataUrlPreview) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isDataUrlPreview, previewUrl]);

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form || !requiredStatusFieldName || requiredStatusValues.length === 0) {
      return;
    }

    const getStatusValue = () => {
      const statusField = form.elements.namedItem(requiredStatusFieldName) as
        | HTMLInputElement
        | null;

      return statusField?.value ?? "";
    };

    const hasUpload = () => Boolean(input.files?.length) || Boolean(existingImageDataUrl);

    const clearValidation = () => {
      input.setCustomValidity("");
      setValidationError("");
    };

    const clearValidationWhenRequirementChanged = () => {
      const isRequiredByStatus = requiredStatusValues.includes(getStatusValue());

      if (!isRequiredByStatus || hasUpload()) {
        clearValidation();
      }
    };

    const handleSubmit = (event: Event) => {
      const isRequiredByStatus = requiredStatusValues.includes(getStatusValue());
      const hasFile = hasUpload();
      const file = input.files?.[0] ?? null;

      if (isProcessingFile) {
        const processingMessage = "Aguarde a otimização da imagem antes de salvar.";
        input.setCustomValidity(processingMessage);
        setValidationError(processingMessage);
        event.preventDefault();
        event.stopPropagation();
        input.reportValidity();
        return;
      }

      const fileValidationMessage = file
        ? validateImageUploadFile({
            name: file.name,
            size: file.size,
            type: file.type
          }, {
            maxBytes
          })
        : "";

      if (fileValidationMessage) {
        input.setCustomValidity(fileValidationMessage);
        setValidationError(fileValidationMessage);
        event.preventDefault();
        event.stopPropagation();
        input.reportValidity();
        return;
      }

      if (isRequiredByStatus && !hasFile) {
        input.setCustomValidity(requiredMessage);
        setValidationError(requiredMessage);
        event.preventDefault();
        event.stopPropagation();
        input.reportValidity();
        return;
      }

      clearValidation();
    };

    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", clearValidationWhenRequirementChanged);
    form.addEventListener("change", clearValidationWhenRequirementChanged);
    clearValidationWhenRequirementChanged();

    return () => {
      form.removeEventListener("submit", handleSubmit);
      form.removeEventListener("input", clearValidationWhenRequirementChanged);
      form.removeEventListener("change", clearValidationWhenRequirementChanged);
    };
  }, [
    existingImageDataUrl,
    isProcessingFile,
    maxBytes,
    requiredMessage,
    requiredStatusFieldName,
    requiredStatusValues
  ]);

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;

    if (!input || !form || !disabledStatusFieldName || disabledStatusValues.length === 0) {
      setDisabledByStatus(false);
      return;
    }

    const syncDisabledStatus = () => {
      const statusField = form.elements.namedItem(disabledStatusFieldName) as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      const shouldDisable = disabledStatusValues.includes(statusField?.value ?? "");

      setDisabledByStatus(shouldDisable);

      if (shouldDisable) {
        input.value = "";
        input.setCustomValidity("");
        setValidationError("");
      }
    };

    form.addEventListener("input", syncDisabledStatus);
    form.addEventListener("change", syncDisabledStatus);
    syncDisabledStatus();

    return () => {
      form.removeEventListener("input", syncDisabledStatus);
      form.removeEventListener("change", syncDisabledStatus);
    };
  }, [disabledStatusFieldName, disabledStatusValues]);

  return (
    <label className="text-sm text-slate-700 dark:text-slate-200">
      {label}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={IMAGE_UPLOAD_ACCEPT_ATTRIBUTE}
        disabled={disabledByStatus}
        required={!disabledByStatus && required && !existingImageDataUrl}
        className={`${inputClassName} ${
          validationError
            ? "border-red-500 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
            : ""
        } ${
          disabledByStatus ? "cursor-not-allowed bg-slate-100 opacity-70 dark:bg-slate-700" : ""
        }`}
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          setValidationError("");
          input.setCustomValidity("");
          setIsProcessingFile(false);

          if (!file) {
            if (!existingImageDataUrl) {
              setSelectedFileName("");
              setPreviewUrl(null);
            }
            return;
          }

          let uploadFile = file;

          if (compressBeforeUpload) {
            setIsProcessingFile(true);
            try {
              uploadFile = await compressImageFile(file, {
                maxBytes: maxBytes ?? file.size,
                targetBytes: compressionTargetBytes ?? maxBytes ?? file.size,
                maxWidth: compressionMaxWidth,
                mimeType: compressionMimeType
              });

              if (uploadFile !== file) {
                const transfer = new DataTransfer();
                transfer.items.add(uploadFile);
                input.files = transfer.files;
              }
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Não foi possível otimizar esta imagem. Selecione outra foto.";
              input.value = "";
              input.setCustomValidity(message);
              setValidationError(message);
              setSelectedFileName("");
              setIsProcessingFile(false);
              if (previewUrl && !previewUrl.startsWith("data:")) {
                URL.revokeObjectURL(previewUrl);
              }
              setPreviewUrl(existingImageDataUrl ?? null);
              return;
            }
            setIsProcessingFile(false);
          }

          const fileValidationMessage = validateImageUploadFile({
            name: uploadFile.name,
            size: uploadFile.size,
            type: uploadFile.type
          }, {
            maxBytes
          });

          if (fileValidationMessage) {
            input.value = "";
            input.setCustomValidity(fileValidationMessage);
            setValidationError(fileValidationMessage);
            setSelectedFileName("");
            if (previewUrl && !previewUrl.startsWith("data:")) {
              URL.revokeObjectURL(previewUrl);
            }
            setPreviewUrl(existingImageDataUrl ?? null);
            return;
          }

          if (previewUrl && !previewUrl.startsWith("data:")) {
            URL.revokeObjectURL(previewUrl);
          }

          setSelectedFileName(uploadFile.name);
          setPreviewUrl(URL.createObjectURL(uploadFile));
        }}
      />
      {helperText ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {helperText}
        </span>
      ) : null}
      {disabledByStatus && disabledMessage ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {disabledMessage}
        </span>
      ) : null}
      {validationError ? (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-300">
          {validationError}
        </span>
      ) : null}
      {isProcessingFile ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          Otimizando imagem...
        </span>
      ) : null}
      {!disabledByStatus && selectedFileName ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          Arquivo selecionado: {selectedFileName}
        </span>
      ) : null}
      {!disabledByStatus && selectedFileName && selectedFileName !== existingFileName ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-slate-700 underline dark:text-slate-200"
          onClick={clearSelectedFile}
        >
          Remover foto selecionada
        </button>
      ) : null}
      {!disabledByStatus && previewUrl ? (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Pré-visualização da imagem"
            className={previewImageClassName}
          />
        </div>
      ) : null}
    </label>
  );
}
