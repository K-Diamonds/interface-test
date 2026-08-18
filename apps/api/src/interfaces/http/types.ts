export interface RouteContext {
  rootDir: string;
  hosted?: boolean;
}

export interface ControlPlaneOptions {
  port?: number;
  rootDir?: string;
  hosted?: boolean;
}

export interface ControlPlaneHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}
