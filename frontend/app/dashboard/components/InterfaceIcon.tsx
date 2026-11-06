import type { CSSProperties } from "react";
export type InterfaceIconName =
  | "pin"
  | "panel-left"
  | "chevron-down"
  | "chevron-right"
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "plus"
  | "close"
  | "download"
  | "refresh"
  | "filter"
  | "check"
  | "external-link"
  | "edit"
  | "trash"
  | "calendar"
  | "search"
  | "grip"
  | "more"
  | "info";
const paths: Partial<Record<InterfaceIconName, string>> = {
  pin: "M8 3h8v5l3 5v2H5v-2l3-5V3M12 15v7M6 3h12",
  "panel-left":
    "M9 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 5 7 7-7 7",
  "arrow-right": "M5 12h14m-6-6 6 6-6 6",
  "arrow-left": "M19 12H5m6-6-6 6 6 6",
  "arrow-up": "M12 19V5m-6 6 6-6 6 6",
  "arrow-down": "M12 5v14m-6-6 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M18 6 6 18",
  download: "M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.5-2L20 8M4 16l2.5 3A7 7 0 0 0 18 17",
  filter: "M4 6h16M7 12h10m-7 6h4",
  check: "m5 12 4 4L19 6",
  "external-link":
    "M14 3h7v7m0-7L10 14m1-11H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6",
  edit: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  calendar:
    "M7 3v4m10-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
};
export function InterfaceIcon({
  name,
  className = "",
  style,
}: {
  name: InterfaceIconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={"app-icon " + className}
      style={style}
    >
      {paths[name] ? (
        <path d={paths[name]} />
      ) : name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </>
      ) : name === "grip" ? (
        <>
          {[5, 12, 19].flatMap((y) =>
            [9, 15].map((x) => (
              <circle
                key={x + "-" + y}
                cx={x}
                cy={y}
                r="1"
                fill="currentColor"
                stroke="none"
              />
            )),
          )}
        </>
      ) : name === "more" ? (
        <>
          {[5, 12, 19].map((x) => (
            <circle
              key={x}
              cx={x}
              cy="12"
              r="1.5"
              fill="currentColor"
              stroke="none"
            />
          ))}
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6m0-10h.01" />
        </>
      )}
    </svg>
  );
}
