// =============================================================================
// Tipi minimi per `dockerode`.
//
// Il pacchetto `dockerode` non distribuisce i propri typings e il progetto
// non installa `@types/dockerode`: senza questa dichiarazione il file
// `src/builder/agents/sandbox.ts` non compilava (TS7016). Qui sono descritte
// solo le API realmente usate dal provider sandbox.
// =============================================================================

declare module "dockerode" {
  export interface DockerOptions {
    socketPath?: string;
    host?: string;
    port?: number;
  }

  export interface ContainerCreateOptions {
    Image?: string;
    Cmd?: string[];
    Env?: string[];
    WorkingDir?: string;
    HostConfig?: {
      AutoRemove?: boolean;
      NetworkMode?: string;
      Memory?: number;
      CpuQuota?: number;
      SecurityOpt?: string[];
    };
    Labels?: Record<string, string>;
  }

  export interface ExecOptions {
    Cmd?: string[];
    WorkingDir?: string;
    Env?: string[];
    AttachStdout?: boolean;
    AttachStderr?: boolean;
    Tty?: boolean;
    User?: string;
  }

  export interface ExecStartOptions {
    hijack?: boolean;
    stdin?: boolean;
  }

  export interface ExecInspectResult {
    ExitCode?: number;
    Running?: boolean;
  }

  export interface ContainerInspectResult {
    State?: {
      Running?: boolean;
      Status?: string;
      ExitCode?: number;
    };
  }

  export interface Exec {
    start(options?: ExecStartOptions): Promise<NodeJS.ReadableStream>;
    inspect(): Promise<ExecInspectResult>;
  }

  export interface Container {
    id: string;
    start(): Promise<unknown>;
    stop(options?: { t?: number }): Promise<unknown>;
    remove(options?: { force?: boolean }): Promise<unknown>;
    inspect(): Promise<ContainerInspectResult>;
    exec(options: ExecOptions): Promise<Exec>;
    putArchive(
      archive: Buffer,
      options?: { path?: string; noOverwriteDirNonDir?: boolean },
    ): Promise<unknown>;
    getArchive(options: { path: string }): Promise<NodeJS.ReadableStream>;
  }

  export class Docker {
    constructor(options?: DockerOptions);
    createContainer(options?: ContainerCreateOptions): Promise<Container>;
    getContainer(id: string): Container;
    listContainers(options?: Record<string, unknown>): Promise<Container[]>;
  }

  const DockerDefault: typeof Docker;
  export default DockerDefault;
}
