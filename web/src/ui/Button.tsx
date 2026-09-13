import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export function Button({ className = '', type = 'button', variant = 'primary', ...props }: ButtonProps) {
  return <button {...props} type={type} className={`button button--${variant} ${className}`.trim()} />;
}
