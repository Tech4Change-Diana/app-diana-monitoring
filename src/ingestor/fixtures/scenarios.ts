/**
 * DIANA — Cenários mock (dados portados de
 * `app-diana-monitoring-lading-page/src/data/scenarios.ts`).
 *
 * Apenas os dados usados pela pipeline (`messages`, `childName`, `contactName`).
 * Os campos de UI do protótipo (icon, signals, excerpts, riskStartIndex, ...)
 * foram removidos.
 */
import type { MockScenario } from "./types.js";

export const mockScenarios: MockScenario[] = [
  {
    id: "grooming",
    label: "Possível grooming",
    childName: "Caio",
    contactName: "Lucas",
    messages: [
      { author: "other", text: "Oi Caio, você joga aquele jogo novo?", time: "14:32" },
      { author: "child", text: "Jogo sim kkk", time: "14:33" },
      { author: "other", text: "Você é muito bom?", time: "14:34" },
      { author: "child", text: "Mais ou menos 😂", time: "14:35" },
      { author: "other", text: "Eu posso te ajudar a passar de fase", time: "14:37" },
      { author: "child", text: "Pode", time: "14:38" },
      {
        author: "other",
        text: "Mas não conta pra ninguém que a gente conversa, tá?",
        time: "14:40",
      },
      { author: "child", text: "Por quê?", time: "14:41" },
      { author: "other", text: "Porque seu pai pode ficar bravo.", time: "14:42" },
      {
        author: "other",
        text: "Me manda uma foto sua, mas não fala para seus pais.",
        time: "14:44",
      },
      { author: "child", text: "Não sei se posso…", time: "14:46" },
    ],
  },
  {
    id: "cyberbullying",
    label: "Cyberbullying",
    childName: "Caio",
    contactName: "Edu",
    messages: [
      { author: "other", text: "eae Caio, vai na escola amanhã?", time: "16:05" },
      { author: "child", text: "vou sim", time: "16:06" },
      { author: "other", text: "todo mundo tá zoando você de novo kkk", time: "16:08" },
      { author: "child", text: "por quê?", time: "16:09" },
      { author: "other", text: "porque você é esquisito, todo mundo acha", time: "16:11" },
      { author: "child", text: "para com isso…", time: "16:12" },
      { author: "other", text: "você não tem amigos, ninguém gosta de você", time: "16:14" },
      { author: "other", text: "sai da escola logo hahaha", time: "16:16" },
      { author: "child", text: "…", time: "16:18" },
      { author: "other", text: "cala a boca e some", time: "16:20" },
    ],
  },
  {
    id: "personal-info",
    label: "Informação pessoal",
    childName: "Caio",
    contactName: "Rafa",
    messages: [
      { author: "other", text: "oi, você é o Caio do time de futebol?", time: "18:20" },
      { author: "child", text: "sou sim", time: "18:22" },
      { author: "other", text: "legal! qual sua idade?", time: "18:23" },
      { author: "child", text: "10", time: "18:24" },
      { author: "other", text: "que série você estuda?", time: "18:26" },
      { author: "child", text: "quinta", time: "18:27" },
      { author: "other", text: "estuda em qual escola?", time: "18:29" },
      { author: "child", text: "Escola Municipal Maria Clara", time: "18:30" },
      { author: "other", text: "me fala seu endereço que eu te mando um presente", time: "18:32" },
      { author: "child", text: "moro na rua das Palmeiras…", time: "18:34" },
    ],
  },
  {
    id: "image-request",
    label: "Solicitação de imagem",
    childName: "Caio",
    contactName: "Leo",
    messages: [
      { author: "other", text: "oii, você é fã do canal que eu sigo?", time: "20:10" },
      { author: "child", text: "sou sim", time: "20:12" },
      { author: "other", text: "eu também, muito bom né", time: "20:13" },
      { author: "other", text: "qual sua parte favorita?", time: "20:14" },
      { author: "child", text: "a parte do desafio", time: "20:15" },
      { author: "other", text: "haha essa é boa", time: "20:16" },
      { author: "other", text: "me manda uma foto sua pra eu ver como você é", time: "20:19" },
      { author: "child", text: "pra quê?", time: "20:20" },
      {
        author: "other",
        text: "só pra ver seu rosto, prometo que não mostro pra ninguém",
        time: "20:21",
      },
      { author: "other", text: "manda aí", time: "20:22" },
      { author: "child", text: "não sei se posso…", time: "20:24" },
    ],
  },
];

export const getScenario = (id: string): MockScenario | undefined =>
  mockScenarios.find((s) => s.id === id);
