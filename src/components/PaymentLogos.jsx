import React from 'react'

export function PaystackLogo({ className = 'h-5 w-auto' }) {
  return (
    <svg
      viewBox="0 0 110 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Paystack"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <rect width="110" height="32" rx="6" fill="#0BA4DB" />
      <path
        d="M14 10H26M14 16H22M14 22H26"
        stroke="#FFFFFF"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <text
        x="34"
        y="21"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="800"
        letterSpacing="-0.3"
      >
        paystack
      </text>
    </svg>
  )
}
