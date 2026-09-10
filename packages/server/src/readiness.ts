export type DependencyCheck = () => Promise<void>;

export type DependencyStatus = "ok" | "unavailable";

export class ReadinessRegistry {
  readonly checks = new Map<string, DependencyCheck>();

  add(name: string, check: DependencyCheck): void {
    this.checks.set(name, check);
  }

  async check(): Promise<{
    status: "ready" | "unavailable";
    dependencies: Record<string, DependencyStatus>;
  }> {
    const dependencies: Record<string, DependencyStatus> = {};
    let status: "ready" | "unavailable" = "ready";
    for (const [name, check] of this.checks) {
      try {
        await check();
        dependencies[name] = "ok";
      } catch {
        dependencies[name] = "unavailable";
        status = "unavailable";
      }
    }
    return { status, dependencies };
  }
}
