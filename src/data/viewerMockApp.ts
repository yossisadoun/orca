/**
 * Static mock for the Viewer tab — classic minimal “todos” UI, not the host app.
 */
export interface ViewerMockTodo {
  title: string;
  done?: boolean;
}

export const viewerMockTodos: ViewerMockTodo[] = [
  { title: "Milk", done: false },
  { title: "Apples", done: false },
];

export const viewerMockInputPlaceholder = "What needs to be done?";
