/** Local offline-demo phase machine — not a shared contract. */
export const ScriptedDemoPhase = {
  LoginUser: "login-user",
  LoginPass: "login-pass",
  LoginClick: "login-click",
  Add: "add",
  Cart: "cart",
  Done: "done",
} as const;
export type ScriptedDemoPhase =
  (typeof ScriptedDemoPhase)[keyof typeof ScriptedDemoPhase];
