# Scope & Work Breakdown Structure: SkillGuard
### The Automated Testing, Linter, & Regression Assertion Framework for AI Agent Skills & MCP Tools

Version 1.1 — 2026-11-07 — Status: Active Tracking (v0.1 Completed & Published, v0.2 Backlog Structured)  
Project Manager: `agent-c5ae563a-562d-469c-b75d-871c0c4fe0bc`  
Target Repo: `https://github.com/Rizkysap-Dev/skillguard`

---

## 1. Scope Boundaries (In / Out)

- **In:**
  - Fast, deterministic local CLI runner (`skillguard test <path>`) with exit codes 0 (pass), 1 (fail), 2 (invalid) in < 3s with zero LLM API / token overhead.
  - Mock tool-call assertions (sequence, exact/contains mode, subset argument matching, wildcard parameters, error simulation).
  - Sandboxed execution: prototype pollution rejection, payload size limit (256 KiB), recursion depth limit (12), terminal control character scrubbing, and automated secret redaction.
  - OpenBot Skill (`SKILL.md`) and Model Context Protocol (MCP) schema mapping and test fixtures.
- **Out:**
  - LLM-as-a-judge / LLM grading (breaks determinism and incurs token costs).
  - Benchmark scoreboard / star leaderboards.
  - Auto-prompt optimization / text generation.
  - Unsupervised live execution on external production services.

---

## 2. Milestone & Task Breakdown (WBS)

### Milestone 1: Arsitektur & Core Engine Deterministik (v0.1 Core) [STATUS: SELESAI]
*Tujuan: Membangun runner CLI lokal berbasis Node.js yang mengeksekusi uji mock tool-call secara deterministik tanpa token LLM.*

| ID | Tugas | Pemilik (Owner) | Dependensi | Kriteria Selesai (Done Criteria) | Status | Bukti Nyata (Evidence) |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **T-01** | Arsitektur Engine & Spesifikasi Kontrak Fixture | Sap Architect (`agent-a64bb79b-...`) | - | Dokumen arsitektur, skema JSON fixture v1, dan kontrak exit codes (0/1/2) disahkan dan tertulis. | `done` | `docs/spec-architecture.md` (commit `9c5188b`) |
| **T-02** | Kurasi Fixture Suite Standar (Pass / Fail / Invalid) | Research Analyst (`agent-f7881160-...`) | T-01 | Fixture deklaratif mencakup skenario lolos, salah argumen, dan invalid schema tersedia. | `done` | Folder `fixtures/pass/`, `fixtures/fail/`, `fixtures/invalid/` (commit `7af6fed`) |
| **T-03** | Implementasi CLI Runner & Assertion Engine | Backend Dev (`agent-df43136d-...`) | T-01, T-02 | CLI runner Node.js mengeksekusi tes < 3 detik tanpa LLM/jaringan dengan exit code 0/1/2 deterministik. | `done` | Modul `src/cli.js`, `src/runner.js`, `src/matcher.js`, `src/schema.js` |
| **T-04** | Sandbox Security, Sanitasi Input & Redaksi Rahasia | Code Reviewer (`agent-0c8957d9-...`) | T-03 | Runner menolak prototype pollution, payload >256 KiB, kedalaman >12, dan meredaksi secret token. | `done` | `tests/security.test.js`, `tests/redaction.test.js` lolos 100% |

### Milestone 2: Pengalaman Pengembang, Kualitas & Distribusi Paket (v0.1 DX/Release) [STATUS: SELESAI]
*Tujuan: Menyediakan branding visual profesional, CI/CD terotomasi, paket npm mandiri, dan jaminan kualitas bebas regresi.*

| ID | Tugas | Pemilik (Owner) | Dependensi | Kriteria Selesai (Done Criteria) | Status | Bukti Nyata (Evidence) |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **T-05** | Visual Branding & Dokumentasi Showcase README | UI/UX Designer (`agent-90b9851f-...`) | T-03 | README memuat banner SVG interaktif, tabel exit codes, petunjuk fixture, dan badge standar industri. | `done` | `README.md`, aset banner `docs/assets/skillguard-banner.svg` |
| **T-06** | Integrasi Workflow CI GitHub Actions & Rutinitas Lokal | Sap Architect (`agent-a64bb79b-...`) | T-03, T-04 | GitHub Actions CI memverifikasi tes pass, fail, dan invalid otomatis di remote tanpa token eksternal. | `done` | `.github/workflows/ci.yml`, template `templates/skillguard-routine.json` |
| **T-07** | Verifikasi QA Rilis & Validasi Paket Bersih (v0.1.0) | QA Tester (`agent-8bae0fb7-...`) | T-04, T-05, T-06 | 72/72 test suite lulus 100% dan verifikasi instalasi tarball npm berjalan tanpa error. | `done` | 72/72 passing tests (`npm test` 761ms), tarball `dist/skillguard-0.1.0.tgz` |
| **T-08** | Publikasi Repositori Remote Publik & Sinkronisasi Git | Code Reviewer (`agent-0c8957d9-...`) | T-07 | Repositori publik live di GitHub dengan branch `main` bersih, commit terverifikasi, dan CI green. | `done` | URL https://github.com/Rizkysap-Dev/skillguard (commit `2773217`) |

### Milestone 3: Peluncuran Organik & Distribusi Komunitas (v0.1 Launch) [STATUS: MENUNGGU PERSETUJUAN]
*Tujuan: Mengumumkan SkillGuard kepada komunitas developer AI/agent untuk adopsi organik dan validasi eksternal.*

| ID | Tugas | Pemilik (Owner) | Dependensi | Kriteria Selesai (Done Criteria) | Status | Bukti Nyata (Evidence) |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **T-09** | Distribusi Peluncuran Komunitas (Show HN, Reddit, Lists) | Research Analyst & PM | T-08 | Draf submission peluncuran dieksekusi setelah persetujuan eksplisit jadwal dan kanal dari pengguna. | `review` | Draf siap: `docs/launch/show-hn-draft.md`, `docs/launch/reddit-localllama.md`, `docs/launch/awesome-lists.md` |

### Milestone 4: Ekosistem Adapter & Otomasi Linter Lanjutan (v0.2 Roadmap) [STATUS: BACKLOG TERENCANA]
*Tujuan: Memperluas kapabilitas dari manual fixture runner menjadi automated ingestion & adversarial fuzzing.*

| ID | Tugas | Pemilik (Owner) | Dependensi | Kriteria Selesai (Done Criteria) | Status | Bukti Nyata (Evidence) |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **T-10** | Generator Fixture Otomatis dari `SKILL.md` (OpenBot Skill Ingestion) | Backend Dev (`agent-df43136d-...`) | T-08, T-01 | CLI `skillguard init --from-skill <path>` menghasilkan template fixture `*.skillguard.json` valid dari `SKILL.md`. | `done` | `docs/openbot-adapter.md`, modul generator `src/adapters/openbot.js`, PR #4 merged, 80/80 passing tests |
| **T-11.1** | Parser Skema Tool MCP Server (`src/adapters/mcp.js`) | Backend Dev (`agent-df43136d-...`) | T-10 | Parser JSON Schema dari manifest MCP tools (`name`, `description`, `inputSchema`) menghasilkan mock template deterministik tanpa LLM. | `in_progress` | Branch `feat/mcp-schema-adapter`, modul `src/adapters/mcp.js` & `tests/mcp-adapter.test.js` |
| **T-11.2** | CLI Flag `--from-mcp` & Verifikasi Integrasi End-to-End | Backend Dev & Code Reviewer | T-11.1 | Perintah CLI `skillguard init --from-mcp <manifest.json>` lolos validasi runner exit code 0/1/2 dan di-merge ke `main`. | `todo` | PR terverifikasi & CI green |
| **T-12** | Generator Skenario Adversarial & Batas Ekstrem (Fuzzer No-LLM) | Research Analyst & Sap Architect | T-11.2 | Perintah `skillguard fuzz <target>` mengenerate mutasi parameter ekstrem secara deterministik. | `todo` | Modul `src/fuzzer.js` dan fixture suite mutasi |
| **T-13** | Audit Keamanan v0.2 & Integrasi Fleet Routine OpenBot | Bot Inspector & Code Reviewer | T-10, T-11, T-12 | Seluruh skill armada OpenBot teruji via rutinitas otomatis berkala dengan 0 regresi keamanan. | `todo` | Laporan rutinitas pengujian armada lokal |

---

## 3. Matriks Risiko & Mitigasi

1. **Divergensi Mock vs Realitas Runtime:**
   - *Pemicu:* Skill lolos uji mock di SkillGuard namun gagal di lingkungan agent hidup.
   - *Mitigasi:* Pembuatan fixture berbasis jejak riil (*record & replay*) dan tes paritas bertahap.
2. **Ketergantungan Eksternal (Scope Creep LLM):**
   - *Pemicu:* Desakan menambahkan evaluasi berbasis LLM API.
   - *Mitigasi:* Gerbang arsitektur tegas: core v0.1 & v0.2 wajib $0 token, deterministik, dan zero network request.
3. **Risiko Otorisasi Distribusi Publik (T-09):**
   - *Pemicu:* Agen memposting pesan ke komunitas publik tanpa verifikasi manusia.
   - *Mitigasi:* Menjaga status T-09 tetap `review/blocked` hingga ada konfirmasi eksplisit dari pengguna.
