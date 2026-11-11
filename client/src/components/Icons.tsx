import type { ReactNode } from "react";

type IconProps = { size?: number };

function Svg({ size = 22, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.2v-6.2h-3.6V21H5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function IconExpenses(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M7 3.5h7.2L19 8.2V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path {...stroke} d="M14 3.8V8h4.2M8.5 12.5h7M8.5 16h5" />
    </Svg>
  );
}

export function IconBalances(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M12 3v18M7 7.5h6.2a2.8 2.8 0 0 1 0 5.6H8.2a2.8 2.8 0 0 0 0 5.6H17" />
    </Svg>
  );
}

export function IconTasks(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M8 6.5h11M8 12h11M8 17.5h11" />
      <path {...stroke} d="m4.5 6.5 1.2 1.2L8 5.4M4.5 12l1.2 1.2L8 10.9M4.8 17.2h.1" />
    </Svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 19.5V10M10 19.5V5M16 19.5v-7M22 19.5H2" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <path
        {...stroke}
        d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"
      />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="m5 12.5 4.2 4.2L19 7.5" />
    </Svg>
  );
}

export function IconChevron(props: IconProps & { direction?: "left" | "right" }) {
  const direction = props.direction ?? "left";
  return (
    <Svg {...props}>
      <path {...stroke} d={direction === "left" ? "m14.5 5-7 7 7 7" : "m9.5 5 7 7-7 7"} />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

export function CategoryIcon({ id, size = 20 }: { id: string; size?: number }) {
  if (id === "electricity") {
    return (
      <Svg size={size}>
        <path {...stroke} d="M13 2.5 5 13.5h6.2L10 21.5 19 10.2h-6.2L13 2.5z" />
      </Svg>
    );
  }
  if (id === "water") {
    return (
      <Svg size={size}>
        <path {...stroke} d="M12 3s6 6.2 6 10.2A6 6 0 0 1 6 13.2C6 9.2 12 3 12 3z" />
      </Svg>
    );
  }
  if (id === "building") {
    return (
      <Svg size={size}>
        <path {...stroke} d="M4 20.5h16M6 20.5V5.5l6-2.5 6 2.5v15M9 9.5h.1M12 9.5h.1M15 9.5h.1M9 13h.1M12 13h.1M15 13h.1M11 20.5v-3.5h2v3.5" />
      </Svg>
    );
  }
  if (id === "groceries") {
    return (
      <Svg size={size}>
        <path {...stroke} d="M6 7.5h12l-1 11.5H7L6 7.5zM9 7.5V6a3 3 0 0 1 6 0v1.5" />
      </Svg>
    );
  }
  if (id === "bruno") {
    return (
      <Svg size={size}>
        <circle cx="7.2" cy="8" r="1.7" fill="currentColor" />
        <circle cx="12" cy="6.2" r="1.7" fill="currentColor" />
        <circle cx="16.8" cy="8" r="1.7" fill="currentColor" />
        <ellipse cx="12" cy="14.2" rx="4.2" ry="3.3" fill="currentColor" />
      </Svg>
    );
  }
  return (
    <Svg size={size}>
      <circle {...stroke} cx="12" cy="12" r="7" />
    </Svg>
  );
}
