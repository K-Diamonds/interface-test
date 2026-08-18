import { createBrowserbaseGateway } from "./browserbase-client.js";

export async function getBrowserbaseLiveViewUrl(sessionId: string): Promise<string | undefined> {
  const debug = await createBrowserbaseGateway().debugSession(sessionId);
  return debug.debuggerFullscreenUrl ?? debug.debuggerUrl;
}
