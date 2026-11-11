import { useEffect, useState } from "react";
import { ALEX_ID, JORDAN_ID } from "../types";
import { todayISO } from "../lib/format";
import { useHousehold, type TaskDraft } from "../state/store";
import { Button, Field, Sheet } from "../components/ui";

export function TaskSheet() {
  const { state, closeTask, saveTask, deleteTask } = useHousehold();
  const existing =
    state.taskEditor && state.taskEditor !== "new"
      ? state.tasks.find((task) => task.id === state.taskEditor && !task.deleted)
      : undefined;
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) {
      setDraft(emptyDraft());
    } else {
      setDraft({
        id: existing.id,
        title: existing.title,
        notes: existing.notes ?? "",
        assignedMemberId: existing.assignedMemberId,
        dueDate: existing.dueDate,
      });
    }
    setError(null);
  }, [state.taskEditor]);

  if (!state.taskEditor) return null;

  return (
    <Sheet title={existing ? "Edit task" : "New task"} onClose={closeTask}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setError(saveTask(draft));
        }}
      >
        <Field label="Title">
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </Field>
        <Field label="Assigned to">
          <select
            value={draft.assignedMemberId}
            onChange={(event) => setDraft({ ...draft, assignedMemberId: event.target.value })}
          >
            <option value={ALEX_ID}>Alex</option>
            <option value={JORDAN_ID}>Jordan</option>
          </select>
        </Field>
        <Field label="Due date">
          <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
        </Field>
        <Field label="Notes">
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="sheet-actions">
          <Button type="submit">Save task</Button>
          {existing ? (
            <Button tone="danger" onClick={() => deleteTask(existing.id)}>
              Delete
            </Button>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}

function emptyDraft(): TaskDraft {
  return { title: "", notes: "", assignedMemberId: ALEX_ID, dueDate: todayISO() };
}
