import { cloneElement, isValidElement, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";

function classNames(...values: Array<string | undefined | false>) { return values.filter(Boolean).join(" "); }

export function Label({ className, required, children, ...props }: LabelHTMLAttributes<HTMLLabelElement> & Readonly<{ required?: boolean }>) {
  return <label {...props} className={classNames("ui-label", className)}>{children}{required ? <><span aria-hidden="true"> *</span><span className="sr-only"> (required)</span></> : null}</label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={classNames("ui-input", className)} />; }

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={classNames("ui-select", className)}>{children}</select>; }

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <span className="ui-checkbox-target"><input {...props} type="checkbox" className={classNames("ui-checkbox", className)} /></span>; }

export function FieldHelp({ id, className, children }: Readonly<{ id: string; className?: string; children: ReactNode }>) { return <p id={id} className={classNames("ui-field-help", className)}>{children}</p>; }

export function FieldError({ id, className, children }: Readonly<{ id: string; className?: string; children: ReactNode }>) { return <p id={id} className={classNames("ui-field-error", className)}><span aria-hidden="true">Error: </span>{children}</p>; }

export type FormFieldProps = Readonly<{
  id: string;
  label: ReactNode;
  children: ReactElement<{
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    disabled?: boolean;
    id?: string;
    readOnly?: boolean;
    required?: boolean;
  }>;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}>;

export function FormField({ id, label, children, help, error, required = false, disabled = false, readOnly = false, className }: FormFieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], helpId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children) ? cloneElement(children, {
    id,
    disabled: disabled || children.props.disabled || undefined,
    readOnly: readOnly || children.props.readOnly || undefined,
    required: required || children.props.required || undefined,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
  }) : children;
  return <div className={classNames("ui-form-field", className)}>
    <Label htmlFor={id} required={required}>{label}</Label>
    {control}
    {help ? <FieldHelp id={helpId!}>{help}</FieldHelp> : null}
    {error ? <FieldError id={errorId!}>{error}</FieldError> : null}
  </div>;
}
