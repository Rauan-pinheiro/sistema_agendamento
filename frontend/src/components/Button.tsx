import type { ReactNode, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'success' | 'accent' | 'ghost' | 'danger' | 'secondary' | 'whatsapp';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    full ? 'btn-full' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && <span className="btn-spinner" />}
      {children}
    </button>
  );
}
