/**
 * DIANA — Tipos das fixtures de cenário (mock).
 *
 * Porte parcial de `app-diana-monitoring-lading-page/src/data/types.ts`:
 * apenas o necessário para o `MockSource`. Campos de UI (icon, signals,
 * excerpts, índices de destaque) foram descartados — a pipeline usa apenas
 * `messages`, `childName` e `contactName`.
 */
import type { MessageAuthor } from "../../contracts/index.js";

export interface FixtureMessage {
  author: MessageAuthor;
  text: string;
  /** HH:MM (apenas referência editorial; o timestamp real é ancorado em `now`). */
  time: string;
}

export interface MockScenario {
  id: string;
  label: string;
  childName: string;
  contactName: string;
  messages: FixtureMessage[];
}
