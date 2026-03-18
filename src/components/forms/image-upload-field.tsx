"use client";

import { useEffect, useMemo, useState } from "react";

type ImageUploadFieldProps = {
  name: string;
  label: string;
  required?: boolean;
  helperText?: string;
  inputClassName?: string;
  existingImageDataUrl?: string | null;
  existingFileName?: string | null;
};

const DEFAULT_INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export function ImageUploadField({
  name,
  label,
  required = false,
  helperText,
  inputClassName = DEFAULT_INPUT_CLASS,
  existingImageDataUrl = null,
  existingFileName = null
}: ImageUploadFieldProps) {
  const [selectedFileName, setSelectedFileName] = useState<string>(
    existingFileName ?? ""
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    existingImageDataUrl ?? null
  );

  useEffect(() => {
    setPreviewUrl(existingImageDataUrl ?? null);
    setSelectedFileName(existingFileName ?? "");
  }, [existingFileName, existingImageDataUrl]);

  const isDataUrlPreview = useMemo(
    () => Boolean(previewUrl?.startsWith("data:")),
    [previewUrl]
  );

  useEffect(() => {
    return () => {
      if (previewUrl && !isDataUrlPreview) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isDataUrlPreview, previewUrl]);

  return (
    <label className="text-sm text-slate-700 dark:text-slate-200">
      {label}
      <input
        type="file"
        name={name}
        accept="image/*"
        required={required && !existingImageDataUrl}
        className={inputClassName}
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (!file) {
            if (!existingImageDataUrl) {
              setSelectedFileName("");
              setPreviewUrl(null);
            }
            return;
          }

          if (previewUrl && !previewUrl.startsWith("data:")) {
            URL.revokeObjectURL(previewUrl);
          }

          setSelectedFileName(file.name);
          setPreviewUrl(URL.createObjectURL(file));
        }}
      />
      {helperText ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {helperText}
        </span>
      ) : null}
      {selectedFileName ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          Arquivo selecionado: {selectedFileName}
        </span>
      ) : null}
      {previewUrl ? (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Pré-visualização da imagem"
            className="max-h-44 rounded-lg border border-slate-200 object-contain dark:border-slate-700"
          />
        </div>
      ) : null}
    </label>
  );
}
