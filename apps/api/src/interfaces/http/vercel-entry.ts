import { createHostedControlPlaneApp } from "./hosted-app.js";

/** Node.js serverless handler. Do not switch this entry to Edge Runtime. */
const app = createHostedControlPlaneApp();

export default app;
