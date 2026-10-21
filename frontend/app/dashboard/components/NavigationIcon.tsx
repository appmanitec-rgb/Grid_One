import type { NavSection } from "@/lib/dashboard-navigation";
export function NavigationIcon({
  icon,
}: {
  icon: NavSection["icon"] | "profile" | "logout";
}) {
  const common = "h-[18px] w-[18px]";
  switch (icon) {
    case "profile":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        </svg>
      );
    case "logout":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m5-12 4 4-4 4m-7-4h11" />
        </svg>
      );
    case "planning":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" />
        </svg>
      );
    case "warehouse":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 10 9-7 9 7v11H3zM3 10h18M8 21v-7h8v7m-4-7v7" />
        </svg>
      );
    case "contracts":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12h8m-8 4h5" />
        </svg>
      );
    case "admin":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      );
    case "overview":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M3 13h8V3H3zM13 21h8v-6h-8zM13 11h8V3h-8zM3 21h8v-6H3z" />
        </svg>
      );
    case "crm":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6M23 11h-6" />
        </svg>
      );
    case "ops":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M14.7 6.3a1 1 0 0 0-1.4-1.4l-8 8a1 1 0 0 0 1.4 1.4z" />
          <path d="M18.4 2.6a3 3 0 1 1 3 3L14 13l-3-3z" />
          <path d="M8 14l3 3-2 5-3-3z" />
        </svg>
      );
    case "assets":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 6V4h10v2M7 18v2h10v-2" />
        </svg>
      );
    case "stock":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.3 7 12 12l8.7-5M12 22V12" />
        </svg>
      );
    case "finance":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M12 1v22M17 5H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H7" />
        </svg>
      );
    case "people":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6M17 11h6" />
        </svg>
      );
    case "hr":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      );
    case "studio":
      return (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M4 4h16v16H4z" />
          <path d="M8 8h8M8 12h5M8 16h8" />
        </svg>
      );
    default:
      return null;
  }
}
