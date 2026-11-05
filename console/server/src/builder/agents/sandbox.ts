// builder/agents/sandbox.ts — Sandbox provider interface and Docker implementation

// dockerode e' CommonJS: in ESM si importa il default export, non il nome
// `Docker` (a runtime: "does not provide an export named 'Docker'").
import Docker from 'dockerode';
import type { SandboxProvider, SandboxExecRequest, SandboxExecResult, SandboxContainer } from "./types.js";

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const SANDBOX_IMAGE = 'aethersy/builder-sandbox:latest'; // Custom image with node, pnpm, git, claude-code
const CONTAINER_TTL_MS = 30 * 60 * 1000; // 30 min idle timeout
const MAX_CONTAINERS = 10;

const containerPool: Map<string, SandboxContainer> = new Map();

export class DockerSandboxProvider implements SandboxProvider {
  private async getOrCreateContainer(): Promise<string> {
    // Find idle container
    for (const [id, container] of containerPool.entries()) {
      if (container.status === 'ready') {
        container.status = 'busy';
        container.last_used_at = new Date().toISOString();
        return id;
      }
    }

    // Create new if under limit
    if (containerPool.size < MAX_CONTAINERS) {
      return this.createContainer();
    }

    // Wait for a container to become available (simple polling)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      for (const [id, container] of containerPool.entries()) {
        if (container.status === 'ready') {
          container.status = 'busy';
          container.last_used_at = new Date().toISOString();
          return id;
        }
      }
    }

    throw new Error('No available sandbox containers');
  }

  async createContainer(): Promise<string> {
    try {
      const container = await docker.createContainer({
        Image: SANDBOX_IMAGE,
        Cmd: ['sleep', 'infinity'],
        HostConfig: {
          AutoRemove: true,
          NetworkMode: 'bridge',
          Memory: 2 * 1024 * 1024 * 1024, // 2GB
          CpuQuota: 100000, // 1 CPU
          SecurityOpt: ['no-new-privileges'],
        },
        WorkingDir: '/workspace',
        Env: ['TERM=xterm-256color'],
      });

      await container.start();

      const containerInfo: SandboxContainer = {
        id: container.id,
        status: 'ready',
        created_at: new Date().toISOString(),
      };

      containerPool.set(container.id, containerInfo);
      console.log(`[sandbox] Created container ${container.id.slice(0, 12)}`);

      // Start idle monitor
      this.monitorContainer(container.id);

      return container.id;
    } catch (error) {
      console.error('[sandbox] Failed to create container:', error);
      throw new Error(`Sandbox creation failed: ${error}`);
    }
  }

  private async monitorContainer(containerId: string): Promise<void> {
    const checkIdle = async () => {
      const info = containerPool.get(containerId);
      if (!info) return; // Already removed

      const idleMs = Date.now() - new Date(info.last_used_at ?? info.created_at).getTime();
      if (idleMs > CONTAINER_TTL_MS && info.status === 'ready') {
        await this.destroyContainer(containerId);
      } else {
        setTimeout(checkIdle, 60000); // Check every minute
      }
    };
    setTimeout(checkIdle, 60000);
  }

  async destroyContainer(containerId: string): Promise<void> {
    const info = containerPool.get(containerId);
    if (!info) return;

    try {
      const container = docker.getContainer(containerId);
      await container.stop({ t: 5 });
      containerPool.delete(containerId);
      console.log(`[sandbox] Destroyed container ${containerId.slice(0, 12)}`);
    } catch (error) {
      console.error(`[sandbox] Error destroying container ${containerId}:`, error);
      containerPool.delete(containerId);
    }
  }

  async ensureContainer(containerId: string): Promise<void> {
    const info = containerPool.get(containerId);
    if (!info) throw new Error(`Container ${containerId} not found`);

    try {
      const container = docker.getContainer(containerId);
      const inspect = await container.inspect();
      if (inspect.State?.Running) return;

      // Restart if stopped
      await container.start();
      info.status = 'ready';
    } catch {
      // Container gone, remove from pool
      containerPool.delete(containerId);
      throw new Error(`Container ${containerId} no longer exists`);
    }
  }

  async exec(req: SandboxExecRequest): Promise<SandboxExecResult> {
    const containerId = await this.getOrCreateContainer();
    const info = containerPool.get(containerId)!;
    info.last_used_at = new Date().toISOString();

    const container = docker.getContainer(containerId);
    const startTime = Date.now();

    try {
      // Write files if provided
      if (req.files && Object.keys(req.files).length > 0) {
        await this.writeFiles(container, req.files, req.workdir ?? '/workspace');
      }

      // Build command
      const cmd = req.args && req.args.length > 0
        ? [req.command, ...req.args]
        : ['sh', '-c', req.command];

      const exec = await container.exec({
        Cmd: cmd,
        WorkingDir: req.workdir ?? '/workspace',
        Env: req.env ? Object.entries(req.env).map(([k, v]) => `${k}=${v}`) : undefined,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      let stdout = '';
      let stderr = '';

      await new Promise<void>((resolve, reject) => {
        const timeout = req.timeout_ms ?? 120000;
        const timer = setTimeout(() => {
          reject(new Error(`Execution timeout after ${timeout}ms`));
        }, timeout);

        stream.on('data', (chunk: Buffer) => {
          // Docker multiplexed stream: first byte is stream type (1=stdout, 2=stderr)
          const type = chunk[0];
          const data = chunk.slice(1).toString('utf8');
          if (type === 1) stdout += data;
          else if (type === 2) stderr += data;
        });

        stream.on('end', () => {
          clearTimeout(timer);
          resolve();
        });

        stream.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const inspect = await exec.inspect();
      const exitCode = inspect.ExitCode ?? 0;

      // Read back modified files (optional - could be large)
      const files = req.files ? await this.readFiles(container, Object.keys(req.files), req.workdir ?? '/workspace') : undefined;

      return {
        stdout,
        stderr,
        exit_code: exitCode,
        files,
        duration_ms: Date.now() - startTime,
      };

    } catch (error) {
      return {
        stdout: '',
        stderr: String(error),
        exit_code: -1,
        duration_ms: Date.now() - startTime,
      };
    } finally {
      info.status = 'ready';
    }
  }

  private async writeFiles(container: any, files: Record<string, string>, workdir: string): Promise<void> {
    // Create a tar archive with the files
    const tar = await this.createTarArchive(files, workdir);
    await container.putArchive(tar, { path: workdir });
  }

  private async readFiles(container: any, paths: string[], workdir: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const path of paths) {
      try {
        const stream = await container.getArchive({ path: `${workdir}/${path}` });
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const tar = Buffer.concat(chunks);
        // Simplified: just extract first file content
        // In production, use tar-fs or similar
        result[path] = tar.toString('utf8').slice(0, 10000); // Limit size
      } catch {
        // File not found or error
      }
    }
    return result;
  }

  private async createTarArchive(files: Record<string, string>, basePath: string): Promise<Buffer> {
    // Simple tar creation - in production use tar-stream
    const entries: Buffer[] = [];
    for (const [path, content] of Object.entries(files)) {
      const header = this.createTarHeader(path, Buffer.from(content, 'utf8').length);
      entries.push(header);
      entries.push(Buffer.from(content, 'utf8'));
      // Padding to 512 bytes
      const pad = 512 - (Buffer.from(content, 'utf8').length % 512);
      if (pad < 512) entries.push(Buffer.alloc(pad));
    }
    // End of archive (two 512-byte zero blocks)
    entries.push(Buffer.alloc(1024));
    return Buffer.concat(entries);
  }

  private createTarHeader(name: string, size: number): Buffer {
    const header = Buffer.alloc(512);
    // name (100 bytes)
    Buffer.from(name.padEnd(100, '\0'), 'ascii').copy(header, 0);
    // mode (8 bytes)
    Buffer.from('0000644 '.padStart(8, '\0'), 'ascii').copy(header, 100);
    // uid (8 bytes)
    Buffer.from('0000000 '.padStart(8, '\0'), 'ascii').copy(header, 108);
    // gid (8 bytes)
    Buffer.from('0000000 '.padStart(8, '\0'), 'ascii').copy(header, 116);
    // size (12 bytes, octal)
    Buffer.from(size.toString(8).padStart(11, '0') + ' ', 'ascii').copy(header, 124);
    // mtime (12 bytes)
    Buffer.from('00000000000 '.padStart(12, '\0'), 'ascii').copy(header, 136);
    // chksum (8 bytes) - placeholder
    Buffer.from('        ', 'ascii').copy(header, 148);
    // typeflag (1 byte)
    header[156] = 0x30; // '0' = regular file
    // linkname (100 bytes)
    Buffer.alloc(100).copy(header, 157);
    // magic (6 bytes)
    Buffer.from('ustar\0', 'ascii').copy(header, 257);
    // version (2 bytes)
    Buffer.from('00', 'ascii').copy(header, 263);
    // uname (32 bytes)
    Buffer.alloc(32).copy(header, 265);
    // gname (32 bytes)
    Buffer.alloc(32).copy(header, 297);
    // devmajor (8 bytes)
    Buffer.alloc(8).copy(header, 329);
    // devminor (8 bytes)
    Buffer.alloc(8).copy(header, 337);
    // prefix (155 bytes)
    Buffer.alloc(155).copy(header, 345);

    // Calculate checksum
    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += header[i];
    }
    const chksum = sum.toString(8).padStart(6, '0') + '\0 ';
    Buffer.from(chksum, 'ascii').copy(header, 148);

    return header;
  }

  // Get pool stats
  getPoolStats(): { total: number; ready: number; busy: number; containers: SandboxContainer[] } {
    let ready = 0, busy = 0;
    for (const c of containerPool.values()) {
      if (c.status === 'ready') ready++;
      else if (c.status === 'busy') busy++;
    }
    return {
      total: containerPool.size,
      ready,
      busy,
      containers: [...containerPool.values()],
    };
  }
}

// Export singleton
export const sandboxProvider = new DockerSandboxProvider();
