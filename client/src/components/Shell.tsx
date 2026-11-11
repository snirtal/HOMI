import type { ReactNode } from "react";
import { monthLabel } from "../lib/format";
import { useHousehold } from "../state/store";
import {
  IconBalances,
  IconExpenses,
  IconHistory,
  IconHome,
  IconSettings,
  IconTasks,
} from "./Icons";
import { Avatar } from "./ui";

const NAV = [
  { id: "dashboard", label: "Home", icon: IconHome },
  { id: "expenses", label: "Expenses", icon: IconExpenses },
  { id: "balances", label: "Balances", icon: IconBalances },
  { id: "tasks", label: "Tasks", icon: IconTasks },
  { id: "history", label: "History", icon: IconHistory },
  { id: "settings", label: "Settings", icon: IconSettings },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { state, go, setMoreOpen } = useHousehold();
  const moreActive = state.screen === "history" || state.screen === "settings";

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <IconHome size={18} />
          </span>
          <span>
            <strong>Homi</strong>
            <small>Household</small>
          </span>
        </div>
        <nav className="side-nav" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={state.screen === item.id ? "nav-link active" : "nav-link"}
                onClick={() => go(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="side-foot">
          <Avatar name="Alex" color="#1f7a4d" size={32} />
          <span>
            <strong>Alex</strong>
            <small>{state.householdName}</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="brand-mobile">
            <span className="brand-mark">
              <IconHome size={16} />
            </span>
            <span>
              <strong>Homi</strong>
              <small>{state.householdName}</small>
            </span>
          </div>
          <div className="topbar-desktop">
            <strong>{state.householdName}</strong>
            <small>{monthLabel(state.year, state.month)}</small>
          </div>
          <div className="who">
            <span>Alex</span>
            <Avatar name="Alex" color="#1f7a4d" />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Primary">
        {NAV.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={state.screen === item.id ? "bottom-link active" : "bottom-link"}
              onClick={() => go(item.id)}
            >
              <span className="nav-icon">
                <Icon size={18} />
              </span>
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          className={moreActive ? "bottom-link active" : "bottom-link"}
          onClick={() => setMoreOpen(!state.moreOpen)}
          aria-expanded={state.moreOpen}
        >
          <span className="nav-icon">
            <IconSettings size={18} />
          </span>
          More
        </button>
      </nav>
      {state.moreOpen ? (
        <div className="more-menu">
          <button type="button" onClick={() => go("history")}>
            <IconHistory size={18} /> History
          </button>
          <button type="button" onClick={() => go("settings")}>
            <IconSettings size={18} /> Settings
          </button>
        </div>
      ) : null}
    </>
  );
}
