# app-diana-monitoring

**Núcleo de background da DIANA** (Telegram ingestor + pipeline + Risk Engine) e **repositório-plataforma**
que hospeda a documentação de arquitetura compartilhada.

A DIANA é uma plataforma de proteção digital infantil orientada à **análise contextual e temporal de
conversas** (grooming/aliciamento, cyberbullying e captura de informação pessoal). Este repositório roda
o processamento em background e é a **fonte única de documentação** para todos os repositórios do projeto.

## 📚 Documentação de arquitetura

Toda a arquitetura, a divisão de repositórios e o mapeamento para a Oracle Cloud (OCI) estão em
**[`docs/`](docs/README.md)** — comece pelo índice:

- [Visão geral do MVP e mapa dos repositórios](docs/README.md)
- [01 — Divisão de repositórios](docs/01-repositorios.md)
- [02 — Pipeline / o que roda em background](docs/02-pipeline-background.md)
- [03 — Comunicação com o Telegram](docs/03-telegram-captura.md)
- [04 — Como a LLM funciona](docs/04-llm-inteligencia.md)
- [05 — Experiência do responsável](docs/05-experiencia-responsavel.md)
- [06 — Mapeamento para a OCI](docs/06-mapeamento-oci.md)
- [07 — Roadmap e rastreabilidade](docs/07-roadmap.md)
- [Contrato de domínio compartilhado](docs/contracts.md)

## Status

Fase 0 — **documentação de arquitetura**. O código dos serviços (ingestor, pipeline, risk-engine) é a
próxima fase. Ver o [roadmap](docs/07-roadmap.md).
