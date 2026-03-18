"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ImageUploadFieldProps = {
  name: string;
  label: string;
  required?: boolean;
  helperText?: string;
  inputClassName?: string;
  existingImageDataUrl?: string | null;
  existingFileName?: string | null;
  requiredStatusFieldName?: string;
  requiredStatusValues?: string[];
  requiredMessage?: string;
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
  existingFileName = null,
  requiredStatusFieldName,
  requiredStatusValues = [],
  requiredMessage = "Anexe uma foto para continuar."
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>(
    existingFileName ?? ""
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    existingImageDataUrl ?? null
  );
  const [validationError, setValidationError] = useState<string>("");

  useEffect(() => {
    setPreviewUrl(existingImageDataUrl ?? null);
    setSelectedFileName(existingFileName ?? "");
    setValidationError("");
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

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form || !requiredStatusFieldName || requiredStatusValues.length === 0) {
      return;
    }

    const handleSubmit = (event: Event) => {
      const statusField = form.elements.namedItem(requiredStatusFieldName) as
        | HTMLInputElement
        | null;
      const statusValue = statusField?.value ?? "";
      const isRequiredByStatus = requiredStatusValues.includes(statusValue);
      const hasFile = Boolean(input.files?.length) || Boolean(existingImageDataUrl);

      if (isRequiredByStatus && !hasFile) {
        input.setCustomValidity(requiredMessage);
        setValidationError(requiredMessage);
        event.preventDefault();
        event.stopPropagation();
        input.reportValidity();
        return;
      }

      input.setCustomValidity("");
      setValidationError("");
    };

    form.addEventListener("submit", handleSubmit);

    return () => {
      form.removeEventListener("submit", handleSubmit);
    };
  }, [
    existingImageDataUrl,
    requiredMessage,
    requiredStatusFieldName,
    requiredStatusValues
  ]);

  return (
    <label className="text-sm text-slate-700 dark:text-slate-200">
      {label}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*"
        required={required && !existingImageDataUrl}
        className={`${inputClassName} ${
          validationError
            ? "border-red-500 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
            : ""
        }`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setValidationError("");
          event.target.setCustomValidity("");

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
      {validationError ? (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-300">
          {validationError}
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
