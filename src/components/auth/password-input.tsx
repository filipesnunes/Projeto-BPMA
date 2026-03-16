"use client";

import { useState } from "react";

type PasswordInputProps = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

export function PasswordInput({
  name,
  label,
  required = false,
  placeholder,
  className
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <label className="text-sm text-slate-700 dark:text-slate-200">
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          type={showPassword ? "text" : "password"}
          name={name}
          required={required}
          placeholder={placeholder}
          className={className}
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className="btn-secondary min-h-10 whitespace-nowrap px-3 py-2 text-xs"
        >
          {showPassword ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </label>
  );
}
