import { describe, it, expect } from "vitest";
import { MockRiskAnalyzer } from "../src/analyzer/MockRiskAnalyzer.js";
import { scenarioToConversation } from "../src/ingestor/mockSource.js";
import { mockScenarios } from "../src/ingestor/fixtures/scenarios.js";

const analyzer = new MockRiskAnalyzer();

describe("MockRiskAnalyzer — detecção sobre texto original (regressão do achado A)", () => {
  it("cenário personal-info detecta pedido E compartilhamento de dados pessoais", async () => {
    const scenario = mockScenarios.find((s) => s.id === "personal-info")!;
    const result = await analyzer.analyzeConversation(scenarioToConversation(scenario, new Date()));

    const types = result.signals.map((s) => s.type);
    // A pseudonimização NÃO pode ter mascarado a detecção destes sinais.
    expect(types).toContain("personal_information_request");
    expect(types).toContain("personal_information_shared");

    // Mesmo assim o relatório de privacidade reporta a PII detectada.
    expect(result.privacy.pseudonymizedFields).toEqual(
      expect.arrayContaining(["school", "address"]),
    );
    // O AnalysisResult nunca carrega a conversa integral (RF-16).
    expect(result).not.toHaveProperty("messages");
    expect(result).not.toHaveProperty("conversation");
  });

  it("grooming resulta em alto risco e requer atenção do responsável", async () => {
    const scenario = mockScenarios.find((s) => s.id === "grooming")!;
    const result = await analyzer.analyzeConversation(scenarioToConversation(scenario, new Date()));
    expect(result.assessment.requiresGuardianAttention).toBe(true);
    expect(result.assessment.score).toBeGreaterThan(0);
  });
});
