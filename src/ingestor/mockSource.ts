/**
 * DIANA — Fonte de ingestão mock (`INGEST_MODE=mock`, default).
 *
 * Adapta `app-diana-monitoring-lading-page/src/ml/adapter.ts`
 * (`scenarioToConversation`), empacotando os cenários portados como um
 * `IngestSource`. Os timestamps são ANCORADOS em `now` para caírem dentro da
 * janela de análise (~6h), preservando a ordem original das mensagens.
 */
import type { Conversation } from "../contracts/index.js";
import type { IngestSource } from "./index.js";
import { mockScenarios } from "./fixtures/scenarios.js";
import type { MockScenario } from "./fixtures/types.js";

/** Espaçamento entre mensagens do cenário ancorado (minutos). */
const GAP_MINUTES = 3;
/** Folga entre a última mensagem e `now` (minutos). */
const TAIL_MINUTES = 1;
const MINUTE_MS = 60 * 1000;

/** Converte um cenário mock em `Conversation`, ancorando os timestamps em `now`. */
export function scenarioToConversation(scenario: MockScenario, now: Date): Conversation {
  const total = scenario.messages.length;
  const startedAtMs = now.getTime() - (TAIL_MINUTES + (total - 1) * GAP_MINUTES) * MINUTE_MS;

  return {
    id: `conv-${scenario.id}`,
    childId: `child-${scenario.id}`,
    childName: scenario.childName,
    contactId: `contact-${scenario.id}`,
    contactName: scenario.contactName,
    startedAt: new Date(startedAtMs).toISOString(),
    messages: scenario.messages.map((m, i) => ({
      id: `${scenario.id}-m${i}`,
      author: m.author,
      text: m.text,
      timestamp: new Date(startedAtMs + i * GAP_MINUTES * MINUTE_MS).toISOString(),
    })),
  };
}

export class MockSource implements IngestSource {
  constructor(private readonly scenarios: MockScenario[] = mockScenarios) {}

  async collect(now: Date): Promise<Conversation[]> {
    return this.scenarios.map((scenario) => scenarioToConversation(scenario, now));
  }
}
