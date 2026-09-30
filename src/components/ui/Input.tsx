import { forwardRef, type InputHTMLAttributes } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`
          w-full px-4 py-2 border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-primary focus:border-transparent
          transition-colors
          ${className}
        `}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'