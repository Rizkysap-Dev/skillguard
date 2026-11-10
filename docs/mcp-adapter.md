# MCP Tool Adapter Design & Specification

> **Status:** Specification & Implementation (v0.2.0)<br>
> **Target:** Model Context Protocol (MCP) Server Manifest (`tools/list`) $\leftrightarrow$ SkillGuard Declarative Fixture Schema (`*.skillguard.json`)<br>
> **Audience:** MCP Server Authors, OpenBot Tool Engineers, CI/CD Maintainers

---

## 1. Ringkasan & Tujuan Desain

Server **Model Context Protocol (MCP)** mengekspos kapabilitas eksternal kepada agent AI melalui manifest daftar tool (`tools/list`) yang berisi nama tool, deskripsi, dan kontrak parameter berbasis JSON Schema (`inputSchema`). Sebelum server MCP diintegrasikan ke dalam rutinitas produksi agent, kontrak pemanggilan tool dan validasi skema argumen perlu diuji secara deterministik, cepat (<1 detik), tanpa akses jaringan, dan tanpa biaya token LLM ($0.00).

Dokumen ini mendefinisikan arsitektur **MCP Tool Adapter** (`src/adapters/mcp.js`) yang memvalidasi manifest tool MCP dan menyusun berkas fixture deklaratif SkillGuard v1 (`*.skillguard.json`) secara otomatis dan deterministik.

---

## 2. Format Input Manifest MCP Tool JSON

Adapter menerima berkas atau objek JSON yang merepresentasikan respons `tools/list` atau manifest deklaratif server MCP:

```json
{
  "name": "github-mcp-server",
  "description": "GitHub repository and issue operations via MCP",
  "tools": [
    {
      "name": "github.create_issue",
      "description": "Create a new GitHub issue in a repository",
      "inputSchema": {
        "type": "object",
        "required": ["owner", "repo", "title"],
        "properties": {
          "owner": { "type": "string" },
          "repo": { "type": "string" },
          "title": { "type": "string" },
          "priority": { "type": "string", "enum": ["low", "medium", "high"] },
          "milestone": { "type": "integer", "minimum": 1 },
          "notify": { "type": "boolean" },
          "labels": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    }
  ]
}
```

### Aturan Validasi Input Manifest
- **`tools` (Wajib):** Array berisi minimal 1 dan maksimal 64 definisi tool (`LIMITS.maxTools`).
- **`tools[].name` (Wajib):** String non-kosong yang cocok dengan pola `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$`.
- **`tools[].description` (Opsional):** String penjelasan fungsi tool.
- **`tools[].inputSchema` (Opsional):** Objek JSON Schema dengan `type: "object"`, `properties` berupa objek skema properti, dan `required` berupa array nama properti bertipe string.
- Tipe properti JSON Schema yang didukung: `string`, `number`, `integer`, `boolean`, `array`, `object`, dan `null`.

---

## 3. Aturan Pemetaan Skema ke Fixture SkillGuard v1

MCP Adapter memetakan manifest MCP ke dalam struktur kontrak `*.skillguard.json` (`version: 1`) dengan aturan berikut:

| Elemen Manifest MCP | Properti Fixture SkillGuard | Tipe | Keterangan Pemetaan |
|:---|:---|:---:|:---|
| `name` (atau `tools[0].name`) | `target.name` & `name` | `string` | Nama server/tool disanitasi menjadi `<name>-mcp-suite` (manifest) atau `<name>-mcp-fixture` (tool tunggal). |
| `description` | `description` | `string` | Deskripsi suite pengujian; menggunakan fallback deskripsi otomatis bila tidak tersedia. |
| Path berkas manifest | `target.path` | `string` | Path relatif ke berkas manifest sumber (misal: `manifests/github-mcp.json`). |
| Klasifikasi komponen | `target.kind` | `string` | Wajib bernilai `"mcp-tool"`. |
| `tools[].name` | `tools[toolName]` | `object` | Didaftarkan pada mock registry dengan nilai kembalian standar `{ "result": { "ok": true } }`. |
| `tools[].inputSchema` | `cases[].calls[0].arguments` | `object` | Argumen mock deterministik dibangkitkan dari `inputSchema.properties` tanpa LLM. |
| Kontrak verifikasi | `cases[].expect` | `object` | Asersi `mode: "exact"` dan `match: "exact"` terhadap panggilan tool dan argumen mock yang dibangkitkan. |

### Aturan Pembangkitan Nilai Mock Deterministik (`buildDeterministicMockValue`)
Untuk menjamin hasil yang *byte-identical* di setiap eksekusi tanpa memanggil LLM:
1. **`const` / `enum` / `default`:** Menggunakan nilai `const`, elemen pertama `enum[0]`, atau nilai `default` jika dideklarasikan pada skema properti.
2. **`string`:** Menghasilkan `"sample_<property_name>"` (karakter non-alfanumerik diganti `_`).
3. **`integer` & `number`:** Menggunakan nilai `minimum` bila valid, atau fallback ke `1`.
4. **`boolean`:** Menghasilkan `true`.
5. **`null`:** Menghasilkan `null`.
6. **`array`:** Menghasilkan array 1 elemen berisi nilai mock dari skema `items` (atau `[]` bila `items` tidak didefinisikan).
7. **`object`:** Membangkitkan properti bersarang secara rekursif dengan urutan kunci terurut secara leksikografis.

---

## 4. Mekanisme Sandboxing & Pertahanan Keamanan

Karena manifest MCP dapat berasal dari repositori pihak ketiga yang belum terpercaya, `src/adapters/mcp.js` menerapkan pertahanan berlapis sebelum menyentuh runner:

1. **Proteksi Prototype Pollution:**
   - Memindai teks JSON mentah dengan ekspresi reguler sebelum `JSON.parse` untuk menolak kunci `"__proto__"`, `"prototype"`, dan `"constructor"` (mencegah penghapusan diam-diam oleh mesin V8).
   - Memeriksa ulang seluruh pohon objek (`assertSafeObjectTree`) dan nama properti di dalam `inputSchema.properties` secara rekursif.
2. **Batas Ukuran Payload (`256 KiB`):**
   - Menolak berkas atau string JSON yang melebihi `LIMITS.maxFileBytes` (`262,144` byte) menggunakan pemeriksaan `stat.size` dan `Buffer.byteLength`.
3. **Batas Kedalaman Rekursi (`Depth Limit 12`):**
   - Menolak objek manifest maupun pohon skema JSON yang bersarang lebih dari `LIMITS.maxDepth` (`12` tingkat) untuk mencegah *stack overflow* atau *denial-of-service*.
4. **Batas Koleksi & Kardinalitas:**
   - Membatasi jumlah kunci objek $\le 200$ (`LIMITS.maxObjectKeys`), panjang array $\le 500$ (`LIMITS.maxArray`), dan jumlah tool per manifest $\le 64$ (`LIMITS.maxTools`).
5. **Penanganan Error Terstruktur (`McpAdapterError`):**
   - Seluruh pelanggaran skema atau batas keamanan melempar `McpAdapterError` dengan kode `MCP_ADAPTER_ERROR`, yang diterjemahkan oleh CLI menjadi `UsageError` dengan **Exit Code 2** dan pesan yang telah melalui sanitasi terminal (`safeFreeText`).

---

## 5. Panduan Penggunaan CLI (`skillguard init --from-mcp`)

SkillGuard menyediakan perintah CLI bawaan untuk mengimpor manifest MCP menjadi berkas fixture siap uji:

### Sintaks Perintah
```bash
# Menghasilkan fixture ke lokasi default: ./fixtures/mcp/<sanitized-name>.skillguard.json
node src/cli.js init --from-mcp <manifest.json>

# Menghasilkan fixture ke lokasi berkas output spesifik
node src/cli.js init --from-mcp <manifest.json> --out <output-file.skillguard.json>
```

### Contoh Alur Kerja End-to-End
```bash
# 1. Generate fixture deklaratif dari manifest MCP Server
node src/cli.js init --from-mcp manifests/github-mcp.json --out fixtures/mcp/github.skillguard.json

# 2. Jalankan verifikasi fixture secara deterministik (Exit Code 0)
node src/cli.js test fixtures/mcp/github.skillguard.json

# 3. Jalankan verifikasi dengan output JSON terstruktur untuk pipeline CI
node src/cli.js test fixtures/mcp/github.skillguard.json --json
```

### Contoh Output Fixture (`*.skillguard.json`)
```json
{
  "version": 1,
  "name": "github-mcp-server-mcp-suite",
  "description": "GitHub repository and issue operations via MCP",
  "target": {
    "kind": "mcp-tool",
    "name": "github-mcp-server",
    "path": "manifests/github-mcp.json"
  },
  "tools": {
    "github.create_issue": {
      "result": {
        "ok": true
      }
    }
  },
  "cases": [
    {
      "name": "github.create_issue deterministic contract call",
      "description": "Create a new GitHub issue in a repository",
      "calls": [
        {
          "tool": "github.create_issue",
          "arguments": {
            "owner": "sample_owner",
            "repo": "sample_repo",
            "title": "sample_title",
            "priority": "low",
            "milestone": 1,
            "notify": true,
            "labels": [
              "sample_labels_item"
            ]
          }
        }
      ],
      "expect": {
        "mode": "exact",
        "calls": [
          {
            "tool": "github.create_issue",
            "arguments": {
              "owner": "sample_owner",
              "repo": "sample_repo",
              "title": "sample_title",
              "priority": "low",
              "milestone": 1,
              "notify": true,
              "labels": [
                "sample_labels_item"
              ]
            },
            "match": "exact"
          }
        ]
      }
    }
  ]
}
```
