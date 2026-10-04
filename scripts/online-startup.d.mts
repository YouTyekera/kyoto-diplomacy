export function isPortFree(port: number, host?: string): Promise<boolean>;
export function portError(name: string, port: number): string;
type Available = (port: number, host: string) => Promise<boolean>;
export function selectPort(options: { name: string; explicit?: string; base: number; host?: string;
  reserved?: number[]; available?: Available }): Promise<number>;
export function resolvePorts(env: NodeJS.ProcessEnv, available?: Available): Promise<{ webPort: number; onlinePort: number }>;
export function childPlans(env: NodeJS.ProcessEnv, ports: { webPort: number; onlinePort: number }):
  { name: string; port: number; env: NodeJS.ProcessEnv; args: string[] }[];
