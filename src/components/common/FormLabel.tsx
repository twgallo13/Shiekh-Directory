import React from 'react';

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  hint?: string;
}

export const FormLabel: React.FC<FormLabelProps> = ({
  required = false,
  hint,
  className = '',
  children,
  ...props
}) => (
  <label className={`mb-1.5 block text-xs font-semibold text-neutral-700 ${className}`} {...props}>
    <span>
      {children}
      {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
    </span>
    {hint && <span className="mt-0.5 block font-normal text-neutral-500">{hint}</span>}
  </label>
);