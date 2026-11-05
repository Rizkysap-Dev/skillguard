# OpenBot Skill Adapter Design & Specification

> **Status:** Specification & Design (v0.1.0)<br>
> **Target:** OpenBot Skill Ecosystem (`SKILL.md`) $\leftrightarrow$ SkillGuard Declarative Fixture Schema (`*.skillguard.json`)<br>
> **Audience:** OpenBot Agent Authors, Tool Engineers, CI/CD Maintainers

---

## 1. Ringkasan & Tujuan Desain

Ekosistem agent OpenBot mengandalkan **Agent Skills**—kumpulan instruksi dan script yang dikemas dalam direktori skill dengan berkas utama `SKILL.md`. Sebelum dideploy atau digunakan oleh agent dalam rutinitas produksi, perilaku pemanggilan tool oleh skill perlu diverifikasi secara deterministik, cepat, dan tanpa biaya token LLM ($0.00).

Dokumen ini mendefinisikan arsitektur **OpenBot Skill Adapter** untuk memetakan spesifikasi `SKILL.md` dan deklarasi tool OpenBot ke dalam skema pengujian deklaratif SkillGuard v1 (`*.skillguard.json`).

---

## 2. Struktur Asli OpenBot Skill (`SKILL.md`)

Sebuah skill OpenBot standar disimpan pada direktori `.agents/skills/<skill-name>/` atau `Shared/` dengan struktur:

```markdown
---
name: nama-skill
description: Penjelasan singkat kegunaan skill untuk agent planner
---

# Judul Panduan Skill

Instruksi kontekstual, urutan kerja, dan batasan keamanan.

## Order of work
1. Panggil tool awal (misal: openbot.list_tables).
2. Panggil tool pemrosesan data (misal: openbot.query_data).
```

Karakteristik penting:
- **YAML Frontmatter:** Menyediakan metadata (`name`, `description`).
- **Markdown Body:** Mendefinisikan urutan eksekusi (*order of work*), konvensi parameter (misal: parameterisasi query SQL), serta batasan keamanan (*safety constraints*).
- **Tool Invocations:** Agent memanggil OpenBot native tools (seperti `openbot.list_tables`, `openbot.execute_data`), MCP tools (`github.*`, `openbot_browser.*`), atau script lokal skill.

---

## 3. Spesifikasi Pemetaan Metadata ke Skema SkillGuard

SkillGuard mengevaluasi pengujian secara deterministik melalui berkas `*.skillguard.json`. Berikut aturan pemetaan formal antara komponen OpenBot Skill dan skema fixture SkillGuard:

| Elemen OpenBot Skill | Properti Fixture SkillGuard | Tipe | Keterangan Pemetaan |
|:---|:---|:---:|:---|
| Frontmatter `name` | `target.name` & `name` | `string` | Nama skill menjadi basis penamaan suite uji (misal: `openbot-data-skill-flow`). |
| Frontmatter `description` | `description` | `string` | Penjelasan skenario pengujian yang diturunkan dari skill. |
| Path berkas `SKILL.md` | `target.path` | `string` | Path relatif ke berkas `SKILL.md` (misal: `.agents/skills/openbot-data/SKILL.md`). |
| Klasifikasi komponen | `target.kind` | `string` | Wajib bernilai `"skill"`. |
| Tools yang dirujuk pada instruksi | `tools` (Mock Registry) | `object` | Setiap tool OpenBot yang dipanggil didaftarkan dengan mock return value (`result`) atau simulasi error (`throws`). |
| Skenario langkah agent | `cases[].calls` | `array` | Urutan tool call yang disimulasikan agent. |
| Ekspektasi kebenaran alur | `cases[].expect` | `object` | Asersi urutan call (`mode: "exact"` atau `"contains"`) dan pencocokan argumen (`exact` atau `match: "subset"`). |

---

## 4. Batasan Kemampuan (*Capabilities & Boundaries*)

Untuk menjaga integritas teknis dan transparansi implementasi pada rilis saat ini:

### Yang Didukung Saat Ini (v0.1.0)
1. **Validasi Fixture Deterministik:** Engine SkillGuard memvalidasi dan mengeksekusi berkas `*.skillguard.json` yang memodelkan interaksi OpenBot tools secara offline tanpa egress jaringan.
2. **Mocking Tools OpenBot:** Mendukung namespace OpenBot seperti `openbot.list_tables`, `openbot.query_data`, `openbot.execute_data`, maupun MCP tools (`openbot_browser.list_tabs`, dsb.).
3. **Pencocokan Parsial (*Subset Matcher*):** Mendukung verifikasi argumen penting (seperti array parameter SQL atau nama repositori) tanpa terikat pada metadata acak atau ID run.
4. **Sensor Kredensial Otomatis:** Token, kunci API, dan password yang muncul pada trace panggilan akan otomatis disensor (`[REDACTED]`) pada laporan kegagalan.

### Batasan & Hal yang Belum Didukung (Out-of-Scope v0.1.0)
1. **Tidak Ada LLM-as-a-judge:** SkillGuard v0.1.0 sengaja tidak menjalankan prompt generator atau LLM judge untuk menjamin kecepatan (<1s), biaya $0.00, dan determinisme 100%.
2. **Tidak Ada Parser Markdown Otomatis Runtime:** SkillGuard v0.1.0 **belum menyediakan compiler otomatis** yang membaca teks naratif `SKILL.md` bebas lalu langsung mengubahnya menjadi JSON fixture di memori tanpa berkas fixture. Penulisan fixture saat ini dilakukan secara deklaratif mengikuti format `*.skillguard.json`. Fitur CLI otomatisasi sintesis fixture (`skillguard adapt <path>`) dialokasikan untuk roadmap v0.2.0.
3. **Konvensi Karakter Tool:** Nama tool wajib diawali alfanumerik dan hanya boleh mengandung `[A-Za-z0-9_.:-]` dengan panjang maksimal 120 karakter.

---

## 5. Contoh Referensi Tervalidasi (`openbot-data`)

Berikut contoh nyata pemetaan skill bawaan OpenBot (`openbot-data`) ke dalam fixture SkillGuard yang telah diverifikasi kelulusannya:

### Berkas Fixture: `templates/openbot-skill.skillguard.json`

```json
{
  "version": 1,
  "name": "openbot-data-skill-flow",
  "description": "Validates that an agent using openbot-data inspects tables before executing parameterized queries.",
  "target": {
    "kind": "skill",
    "name": "openbot-data",
    "path": ".agents/skills/openbot-data/SKILL.md"
  },
  "tools": {
    "openbot.list_tables": {
      "result": [
        { "name": "qa_targets", "rowCount": 3, "creator": "agent-qa" }
      ]
    },
    "openbot.query_data": {
      "result": [
        { "target": "SkillGuard", "status": "active" }
      ]
    },
    "openbot.execute_data": {
      "result": { "rowsAffected": 1 }
    }
  },
  "cases": [
    {
      "name": "queries table after listing existing tables",
      "description": "Agent must inspect available tables first to verify schema before executing SELECT query.",
      "calls": [
        {
          "tool": "openbot.list_tables",
          "arguments": {}
        },
        {
          "tool": "openbot.query_data",
          "arguments": {
            "sql": "SELECT target, status FROM qa_targets WHERE status = ? LIMIT 10;",
            "params": ["active"]
          }
        }
      ],
      "expect": {
        "mode": "exact",
        "calls": [
          {
            "tool": "openbot.list_tables",
            "arguments": {}
          },
          {
            "tool": "openbot.query_data",
            "arguments": {
              "sql": "SELECT target, status FROM qa_targets WHERE status = ? LIMIT 10;",
              "params": ["active"]
            }
          }
        ]
      }
    },
    {
      "name": "executes parameterized upsert with subset match",
      "description": "Ensures INSERT uses params placeholder without exposing raw SQL strings.",
      "calls": [
        {
          "tool": "openbot.execute_data",
          "arguments": {
            "sql": "INSERT INTO qa_targets (target, status) VALUES (?, ?) ON CONFLICT DO UPDATE SET status = excluded.status;",
            "params": ["SkillGuard", "verified"]
          }
        }
      ],
      "expect": {
        "mode": "exact",
        "calls": [
          {
            "tool": "openbot.execute_data",
            "match": "subset",
            "arguments": {
              "params": ["SkillGuard", "verified"]
            }
          }
        ]
      }
    }
  ]
}
```

---

## 6. Alur Kerja Pengujian Manual (*Manual Workflow Guide*)

Bagi developer atau agent perancang skill yang ingin memverifikasi skill secara lokal:

### Langkah 1: Buat Berkas Fixture
Tulis berkas pengujian berekstensi `.skillguard.json` (misal di folder `fixtures/` atau `templates/`) yang memodelkan urutan pemanggilan tool sesuai aturan `SKILL.md`.

### Langkah 2: Jalankan Pemeriksaan Lokal
Gunakan CLI SkillGuard secara langsung:
```bash
# Pengujian tunggal dengan human-readable report
node src/cli.js test templates/openbot-skill.skillguard.json

# Pengujian dengan output format JSON terstruktur untuk bot/dashboard
node src/cli.js test templates/openbot-skill.skillguard.json --json
```

### Langkah 3: Evaluasi Kode Keluar (Exit Codes)
- **Exit Code 0:** Seluruh skenario pengujian sukses (PASS).
- **Exit Code 1:** Kegagalan asersi (FAIL)—ada ketidaksesuaian tool atau argumen.
- **Exit Code 2:** Kesalahan format/skema (INVALID)—fixture melanggar batasan ukuran atau tipe data.

Alur ini sepenuhnya airgapped, tidak memerlukan API key, dan selesai dalam waktu kurang dari 100 milidetik.
