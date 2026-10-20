import { Link } from '@tanstack/react-router'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 text-accent"
        aria-hidden="true"
      >
        <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
      </svg>
      Filtre
    </Link>
  )
}
