import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { HouseholdProvider, useHousehold } from "./state/store";
import { Balances } from "./screens/Balances";
import { Dashboard } from "./screens/Dashboard";
import { ExpenseSheet } from "./screens/ExpenseSheet";
import { Expenses } from "./screens/Expenses";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";
import { SettlementSheet } from "./screens/SettlementSheet";
import { TaskSheet } from "./screens/TaskSheet";
import { Tasks } from "./screens/Tasks";

export function App() {
  return (
    <HouseholdProvider>
      <Prototype />
    </HouseholdProvider>
  );
}

function Prototype() {
  const { state } = useHousehold();

  useEffect(() => {
    const titles: Record<typeof state.screen, string> = {
      dashboard: "Home",
      expenses: "Expenses",
      balances: "Balances",
      tasks: "Tasks",
      history: "History",
      settings: "Settings",
    };
    document.title = `Homi · ${titles[state.screen]}`;
  }, [state.screen]);

  useEffect(() => {
    document.body.classList.toggle(
      "sheet-open",
      Boolean(state.expenseEditor || state.taskEditor || state.settlementEditor),
    );
  }, [state.expenseEditor, state.taskEditor, state.settlementEditor]);

  return (
    <div className="app">
      <Shell>
        {state.screen === "dashboard" && <Dashboard />}
        {state.screen === "expenses" && <Expenses />}
        {state.screen === "balances" && <Balances />}
        {state.screen === "tasks" && <Tasks />}
        {state.screen === "history" && <History />}
        {state.screen === "settings" && <Settings />}
      </Shell>
      <ExpenseSheet />
      <TaskSheet />
      <SettlementSheet />
      {state.notice ? (
        <div className="toast" role="status">
          {state.notice}
        </div>
      ) : null}
    </div>
  );
}
