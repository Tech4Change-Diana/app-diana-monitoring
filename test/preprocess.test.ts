import { describe, it, expect } from "vitest";
import { detectPii, pseudonymizeText } from "../src/pipeline/preprocess.js";
import type { Conversation } from "../src/contracts/index.js";

const conv = (texts: string[]): Conversation => ({
  id: "c1",
  childId: "child",
  childName: "X",
  contactId: "contact",
  contactName: "Y",
  startedAt: "2026-09-13T10:00:00Z",
  messages: texts.map((text, i) => ({
    id: `m${i}`,
    author: "child" as const,
    text,
    timestamp: new Date(Date.parse("2026-09-13T10:00:00Z") + i * 60000).toISOString(),
  })),
});

describe("detectPii", () => {
  it("detecta PII e reporta os campos pseudonimizados", () => {
    const { piiFindings, privacy } = detectPii(
      conv(["moro na rua das Palmeiras", "estudo na Escola Municipal"]),
    );
    expect(privacy.piiMinimized).toBe(true);
    expect(privacy.pseudonymizedFields).toEqual(
      expect.arrayContaining(["address", "school", "location"]),
    );
    expect(piiFindings.length).toBeGreaterThan(0);
  });

  it("NÃO armazena o trecho de PII original — snippet é apenas o marcador redigido (§9/P7)", () => {
    const { piiFindings } = detectPii(conv(["meu email é fulano@example.com"]));
    const email = piiFindings.find((f) => f.type === "email");
    expect(email).toBeDefined();
    expect(email!.snippet).toBe("[E-MAIL]");
    // Nunca o valor bruto.
    expect(email!.snippet).not.toContain("fulano@example.com");
  });

  it("conversa sem PII não gera achados", () => {
    const { piiFindings, privacy } = detectPii(conv(["oi", "tudo bem?"]));
    expect(piiFindings).toHaveLength(0);
    expect(privacy.piiMinimized).toBe(false);
  });
});

describe("pseudonymizeText", () => {
  it("mascara trechos sensíveis por marcadores (para o que sai da memória)", () => {
    expect(pseudonymizeText("moro na rua das Flores")).toContain("[ENDEREÇO]");
    expect(pseudonymizeText("meu email fulano@example.com")).toContain("[E-MAIL]");
  });
});
