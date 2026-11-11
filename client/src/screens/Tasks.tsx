import { formatDay, greeting, todayISO } from "../lib/format";
import { useHousehold } from "../state/store";
import { memberName } from "../components/ui";

export function Tasks() {
  const { state, members, toggleTask, openTask } = useHousehold();
  const today = todayISO();
  const tasks = state.tasks.filter((task) => !task.deleted);
  const open = tasks.filter((task) => task.status === "open");
  const overdue = open.filter((task) => task.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = open.filter((task) => task.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = tasks.filter((task) => task.status === "completed");
  const featured = overdue[0];
  const also = [...overdue.slice(1), ...upcoming];
  const ratio = tasks.length === 0 ? 0 : done.length / tasks.length;
  const circumference = 2 * Math.PI * 26;

  return (
    <section className="screen">
      <header className="page-head">
        <div>
          <p className="eyebrow">{state.householdName}</p>
          <h1>{greeting()}</h1>
          <p className="muted">{open.length === 0 ? "The list is clear." : "Here's what still needs doing."}</p>
        </div>
        <div className="ring-wrap" aria-label={`${done.length} of ${tasks.length} tasks done`}>
          <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
            <circle cx="38" cy="38" r="26" fill="none" stroke="#e6eeea" strokeWidth="6" />
            <circle
              cx="38"
              cy="38"
              r="26"
              fill="none"
              stroke={overdue.length > 0 ? "#b42318" : "#1f7a4d"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${circumference * ratio} ${circumference}`}
              transform="rotate(-90 38 38)"
            />
            <text x="38" y="36" textAnchor="middle" fontSize="16" fontWeight="700" fill="#173128">
              {done.length}
            </text>
            <text x="38" y="50" textAnchor="middle" fontSize="11" fill="#5e746b">
              / {tasks.length}
            </text>
          </svg>
        </div>
      </header>
      <button type="button" className="button primary" onClick={() => openTask(null)}>
        Add task
      </button>

      {featured ? (
        <article className="task-feature">
          <div className="feature-row">
            <span className="eyebrow">{memberName(members, featured.assignedMemberId)}</span>
            <span className="status overdue">Overdue</span>
          </div>
          <h2>{featured.title}</h2>
          <p>{featured.notes ?? `Was due ${formatDay(featured.dueDate)}`}</p>
          <button type="button" className="button light" onClick={() => toggleTask(featured.id)}>
            Mark complete
          </button>
        </article>
      ) : null}

      <section className="stack">
        <h2 className="group-label">{featured ? "Also open" : "Open"}</h2>
        {also.length === 0 ? <p className="muted">Nothing else is open.</p> : null}
        {also.map((task) => (
          <article key={task.id} className="task">
            <button type="button" className="check-button" onClick={() => toggleTask(task.id)} aria-label={`Complete ${task.title}`}>
              <span className="check" />
            </button>
            <button type="button" className="task-copy" onClick={() => openTask(task.id)}>
              <strong>{task.title}</strong>
              <span className={task.dueDate < today ? "muted late" : "muted"}>
                {memberName(members, task.assignedMemberId)} · {task.dueDate < today ? "Overdue" : task.dueDate === today ? "Today" : formatDay(task.dueDate)}
              </span>
            </button>
          </article>
        ))}
      </section>

      <section className="stack">
        <h2 className="group-label">Completed</h2>
        {done.length === 0 ? <p className="muted">Completed tasks will land here.</p> : null}
        {done.map((task) => (
          <article key={task.id} className="task done">
            <button type="button" className="check-button on" onClick={() => toggleTask(task.id)} aria-label={`Reopen ${task.title}`}>
              <span className="check on" />
            </button>
            <button type="button" className="task-copy" onClick={() => openTask(task.id)}>
              <strong>{task.title}</strong>
              <span className="muted">
                {memberName(members, task.assignedMemberId)}
                {task.completedAt ? ` · Done ${formatDay(task.completedAt)}` : ""}
              </span>
            </button>
          </article>
        ))}
      </section>
    </section>
  );
}
