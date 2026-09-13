import { describe, it, expect } from "vitest";
import { runBatch, type RunBatchDeps } from "../src/scheduler/runBatch.js";
import { MockSource } from "../src/ingestor/mockSource.js";
import { MockRiskAnalyzer } from "../src/analyzer/MockRiskAnalyzer.js";
import { loadConfig } from "../src/config/index.js";
import { createLogger } from "../src/logger.js";
import { mockScenarios } from "../src/ingestor/fixtures/scenarios.js";
import type { StateStore, Checkpoint, TelegramOffset, AlertRecord } from "../src/state/index.js";

/** StateStore em memória para o teste de fumaça. */
class InMemoryStore implements StateStore {
  checkpoints = new Map<string, Checkpoint>();
  offset: TelegramOffset | null = null;
  alerts: AlertRecord[] = [];

  async getCheckpoint(id: string) {
    return this.checkpoints.get(id) ?? null;
  }
  async putCheckpoint(cp: Checkpoint) {
    this.checkpoints.set(cp.conversation_id, cp);
  }
  async getTelegramOffset() {
    return this.offset;
  }
  async putTelegramOffset(o: TelegramOffset) {
    this.offset = o;
  }
  async putAlert(a: AlertRecord) {
    this.alerts.push(a);
  }
}

const silentLogger = createLogger("error");

describe("runBatch (mock, ponta a ponta)", () => {
  it("cenário grooming resulta em ALERTED com requiresGuardianAttention", async () => {
    const grooming = mockScenarios.find((s) => s.id === "grooming")!;
    const store = new InMemoryStore();
    const deps: RunBatchDeps = {
      config: loadConfig({ INGEST_MODE: "mock" } as NodeJS.ProcessEnv),
      source: new MockSource([grooming]),
      analyzer: new MockRiskAnalyzer(),
      store,
      logger: silentLogger,
    };

    const summary = await runBatch(deps, new Date());

    expect(summary.conversations).toBe(1);
    expect(summary.alerted).toBe(1);
    expect(store.alerts).toHaveLength(1);

    const alert = store.alerts[0]!;
    expect(alert.result.assessment.requiresGuardianAttention).toBe(true);
    expect(alert.result.assessment.score).toBeGreaterThan(0);
    expect(alert.result.signals.length).toBeGreaterThan(0);
    // Trilha de auditoria da máquina de estados terminou em ALERTED.
    const stages = alert.result.audit.map((a) => a.stage);
    expect(stages[0]).toBe("RECEIVED");
    expect(stages).toContain("ANALYZING");
    expect(stages[stages.length - 1]).toBe("ALERTED");
    // Privacy report presente (autoridade do orquestrador).
    expect(alert.result.privacy.prepared).toBe(true);
    // Checkpoint por conversa gravado.
    expect(store.checkpoints.get(alert.conversationId)?.status).toBe("done");
  });

  it("processa todos os cenários mock e produz pelo menos um alerta", async () => {
    const store = new InMemoryStore();
    const deps: RunBatchDeps = {
      config: loadConfig({ INGEST_MODE: "mock" } as NodeJS.ProcessEnv),
      source: new MockSource(),
      analyzer: new MockRiskAnalyzer(),
      store,
      logger: silentLogger,
    };

    const summary = await runBatch(deps, new Date());
    expect(summary.conversations).toBe(mockScenarios.length);
    expect(summary.alerted + summary.discarded).toBe(mockScenarios.length);
    expect(summary.alerted).toBeGreaterThanOrEqual(1);
  });
});
