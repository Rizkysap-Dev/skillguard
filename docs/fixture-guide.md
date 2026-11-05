# SkillGuard Fixture Authoring Guide

> Panduan praktis perancangan, penulisan, dan validasi berkas uji (*fixtures*) untuk Agent Skills dan MCP (Model Context Protocol) Tools menggunakan SkillGuard.

---

## 1. Konsep Dasar Fixture

Berkas fixture SkillGuard (`*.skillguard.json`) adalah spesifikasi pengujian deklaratif yang memodelkan interaksi antara Agent (atau Model) dengan ekosistem tools yang digunakannya.

Berbeda dengan evaluasi berbasis prompt atau LLM-as-a-judge yang lambat dan fluktuatif, fixture SkillGuard mendefinisikan:
1. **Mock Tools:** Daftar tools yang tersedia beserta respon balik tiruannya (*mock results* atau *mock errors*).
2. **Recorded Calls:** Urutan pemanggilan tool yang disimulasikan oleh agent.
3. **Expectations:** Ekspektasi kebenaran nama tool, urutan pemanggilan, serta argumen parameter yang wajib dipenuhi.

---

## 2. Anatomi Berkas Fixture

Struktur dokumen JSON wajib mengikuti skema `version: 1`:

```json
{
  "version": 1,
  "name": "nama-suite-pengujian",
  "description": "Deskripsi opsional tujuan pengujian",
  "target": {
    "kind": "mcp-tool",
    "name": "target-tool-atau-skill",
    "path": "src/tools/weather.js"
  },
  "tools": {
    "namespace.tool_name": {
      "result": { "status": "ok", "data": 42 }
    }
  },
  "cases": [
    {
      "name": "nama skenario kasus uji",
      "description": "Deskripsi opsional perilaku yang diuji",
      "calls": [
        {
          "tool": "namespace.tool_name",
          "arguments": { "query": "test" }
        }
      ],
      "expect": {
        "mode": "exact",
        "calls": [
          {
            "tool": "namespace.tool_name",
            "arguments": { "query": "test" }
          }
        ]
      }
    }
  ]
}
```

### Penjelasan Field Utama

| Field | Tipe | Wajib | Keterangan |
|:---|:---:|:---:|:---|
| `version` | `number` | **Ya** | Wajib bernilai `1`. |
| `name` | `string` | **Ya** | Nama penjelas suite fixture (maks 8,192 karakter). |
| `description` | `string` | Tidak | Catatan konteks tambahan mengenai suite pengujian. |
| `target` | `object` | Tidak | Metadata opsional target pengujian (`kind: "skill"` atau `"mcp-tool"`). |
| `tools` | `object` | **Ya** | Registry mock tools. Maksimal 64 deklarasi per fixture. |
| `cases` | `array` | **Ya** | Daftar skenario pengujian. Minimal 1 kasus, maksimal 200 kasus. |

---

## 3. Mendeklarasikan Mock Tools

Setiap tool yang dipanggil di dalam `cases` **wajib** dideklarasikan di dalam blok `tools`. Memanggil tool yang tidak terdaftar akan memicu status `INVALID` (Exit Code `2`).

Setiap deklarasi tool wajib memilih **salah satu**: `result` atau `throws`.

### Pola A: Mock Hasil Sukses (`result`)
Mengembalikan objek, array, string, atau angka tiruan ketika tool dipanggil:

```json
"tools": {
  "weather.get_current": {
    "result": {
      "location": "Jakarta",
      "temperature_c": 28.5,
      "condition": "Partly Cloudy"
    }
  }
}
```

### Pola B: Mock Simulasi Error / Failure (`throws`)
Mensimulasikan kegagalan downstream API atau error sistem untuk menguji resiliensi agent:

```json
"tools": {
  "database.execute_query": {
    "throws": {
      "message": "Connection timed out after 5000ms",
      "code": "ETIMEDOUT"
    }
  }
}
```

> **Aturan Penamaan Tool:** Nama tool wajib diawali karakter alfanumerik dan hanya boleh mengandung `A-Za-z0-9`, `_`, `.`, `:`, `-` dengan panjang maksimal 120 karakter.

---

## 4. Pola Pencocokan Argumen (*Matcher Strategies*)

SkillGuard menyediakan fleksibilitas tingkat tinggi dalam memverifikasi panggilan tool:

### 1. Pencocokan Ketat (*Exact Matching*) — Default
Secara default, `expect.mode` adalah `"exact"`. Seluruh panggilan harus sama persis dalam jumlah, urutan, dan struktur objek argumen.

```json
"expect": {
  "mode": "exact",
  "calls": [
    {
      "tool": "math.add",
      "arguments": { "a": 10, "b": 20 }
    }
  ]
}
```

### 2. Pencocokan Toleran / Urutan Parsial (`mode: "contains"`)
Jika agent melakukan pemanggilan tool pembantu (misal log, telemetry, query info awal) yang tidak kritis, gunakan `mode: "contains"`. Mode ini memastikan panggilan yang diharapkan dieksekusi secara berurutan, meskipun ada panggilan tambahan lain di sela-selanya.

```json
"expect": {
  "mode": "contains",
  "calls": [
    {
      "tool": "payment.charge",
      "arguments": { "amount": 50000 }
    }
  ]
}
```

### 3. Pencocokan Subset Argumen (`match: "subset"`)
Sangat berguna ketika tool menerima parameter dinamis (seperti timestamp, requestId, atau metadata tambahan) yang tidak perlu di-assert secara kaku:

```json
"expect": {
  "calls": [
    {
      "tool": "user.update",
      "match": "subset",
      "arguments": {
        "email": "user@example.com"
      }
    }
  ]
}
```
*Catatan:* Pada `match: "subset"`, jika agent memanggil tool dengan `{ "email": "user@example.com", "updated_at": 169999999, "trace_id": "xyz" }`, asersi akan tetap **LULUS (PASS)**.

### 4. Asersi Wildcard (Mengabaikan Argumen)
Jika Anda hanya ingin memverifikasi bahwa tool tertentu dieksekusi tanpa memedulikan nilai argumennya, cukup hilangkan field `arguments` pada expected call:

```json
"expect": {
  "calls": [
    {
      "tool": "analytics.track_pageview"
    }
  ]
}
```

---

## 5. Resep & Contoh Nyata (*Cookbook*)

### Resep 1: Weather Agent Skill (Input Validation & Formatting)
Menguji bahwa skill cuaca memanggil tool geocoding sebelum tool prakiraan cuaca:

```json
{
  "version": 1,
  "name": "weather-agent-flow",
  "tools": {
    "geo.lookup": {
      "result": { "lat": -6.2088, "lon": 106.8456, "city": "Jakarta" }
    },
    "weather.forecast": {
      "result": { "temp": 30, "summary": "Sunny" }
    }
  },
  "cases": [
    {
      "name": "resolves coordinates then fetches forecast",
      "calls": [
        { "tool": "geo.lookup", "arguments": { "query": "Jakarta" } },
        { "tool": "weather.forecast", "arguments": { "lat": -6.2088, "lon": 106.8456 } }
      ],
      "expect": {
        "calls": [
          { "tool": "geo.lookup", "arguments": { "query": "Jakarta" } },
          { "tool": "weather.forecast", "arguments": { "lat": -6.2088, "lon": 106.8456 } }
        ]
      }
    }
  ]
}
```

### Resep 2: Error Fallback Handling (Simulasi Throws)
Menguji bahwa ketika database utama throws error, agent melakukan fallback ke secondary cache:

```json
{
  "version": 1,
  "name": "resilience-fallback-test",
  "tools": {
    "db.primary_read": {
      "throws": { "message": "database unavailable", "code": "DB_DOWN" }
    },
    "cache.fallback_read": {
      "result": { "cached": true, "payload": { "id": 101, "name": "SkillGuard" } }
    }
  },
  "cases": [
    {
      "name": "falls back to cache when primary db throws",
      "calls": [
        { "tool": "db.primary_read", "arguments": { "id": 101 } },
        { "tool": "cache.fallback_read", "arguments": { "id": 101 } }
      ],
      "expect": {
        "calls": [
          { "tool": "db.primary_read", "arguments": { "id": 101 } },
          { "tool": "cache.fallback_read", "arguments": { "id": 101 } }
        ]
      }
    }
  ]
}
```

### Resep 3: Proteksi Kredensial & Redaksi Otomatis
Menguji bahwa panggilan ke tool autentikasi terlindungi dari kebocoran log. Jika asersi gagal, nilai token akan otomatis disensor menjadi `[REDACTED]`:

```json
{
  "version": 1,
  "name": "auth-redaction-test",
  "tools": {
    "auth.verify_token": { "result": { "valid": true } }
  },
  "cases": [
    {
      "name": "redacts api token in test failure output",
      "calls": [
        { "tool": "auth.verify_token", "arguments": { "api_key": "sk-live-1234567890abcdef" } }
      ],
      "expect": {
        "calls": [
          { "tool": "auth.verify_token", "arguments": { "api_key": "sk-live-different9999" } }
        ]
      }
    }
  ]
}
```

Output kegagalan yang dihasilkan di terminal/CI:
```
FAIL fixtures/fail/auth-redaction.skillguard.json
  FAIL redacts api token in test failure output
    call 1 arguments.api_key: expected [REDACTED], got [REDACTED]
```

---

## 6. Panduan Menjalankan CLI

### Menjalankan Satu Fixture
```bash
node src/cli.js test fixtures/pass/basic.skillguard.json
```

### Menjalankan Seluruh Direktori Fixtures
```bash
node src/cli.js test fixtures/pass
```

### Menghasilkan Laporan Mesin JSON
```bash
node src/cli.js test fixtures/pass --json
```

---

## 7. Diagnostik Error & Troubleshooting

| Pesan Validasi | Penyebab Umum | Solusi |
|:---|:---|:---|
| `tool is not declared in fixture.tools` | Agent memanggil tool yang belum didaftarkan di blok `tools`. | Tambahkan deklarasi tool tersebut di bawah `tools: { ... }`. |
| `must define exactly one of "result" or "throws"` | Deklarasi tool memuat kedua field sekaligus atau tidak memuat keduanya. | Tentukan apakah tool mengembalikan sukses (`result`) atau error (`throws`). |
| `forbidden key` | Objek fixture memuat key berbahaya (`__proto__`, `prototype`, `constructor`). | Hapus key prototype pollution dari payload JSON. |
| `value exceeds the maximum object/array depth of 12` | Struktur objek JSON terlalu bertingkat / bersarang (>12 level). | Ratakan (*flatten*) struktur data argumen. |
| `integer exceeds the safe integer range` | Angka melebihi `Number.MAX_SAFE_INTEGER` ($2^{53} - 1$). | Gunakan representasi string untuk ID numerik berukuran sangat besar (misal 64-bit snowflake IDs). |
| `fixture exceeds the maximum file size of 262144 bytes` | Ukuran file JSON melebihi 256 KiB. | Pecah fixture ke dalam beberapa berkas yang lebih terfokus. |
