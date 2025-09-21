# Meal Logging JSON Instructions

This document describes how to parse meal inputs into structured JSON, validate them, and handle updates/merges. It is designed for use with an LLM parser plus a nutrition API (e.g., USDA FDC).

---

## 1. JSON Schema Overview

Each log entry should follow the **MealLog** schema:

```json
{
  "user_id": "string",
  "logged_at_iso": "2025-09-20T20:24:00-04:00",
  "meal_type": "breakfast|lunch|dinner|snack|drink|unknown",
  "context_note": "string",
  "items": [
    {
      "raw_text": "string",
      "name": "string",
      "brand": "string|null",
      "preparation": ["string"],
      "quantity": {
        "value": 1,
        "unit": "count|slice|cup|oz_fl|oz|g|ml|tbsp|tsp|packet|bottle|pint|can|other",
        "display": "large"
      },
      "size_hint": "small|medium|large|null",
      "alcohol": { "abv_pct": 5, "volume_ml": 473, "is_alcohol": true },
      "nutrition_estimate": {
        "calories_kcal": 300,
        "protein_g": 7,
        "carbs_g": 60,
        "fat_g": 3,
        "fiber_g": null,
        "source": "usda|brand|heuristic|user",
        "confidence": 0.62
      },
      "lookup": {
        "status": "pending|matched|ambiguous",
        "candidates": [
          { "provider": "usda_fdc", "id": "123456", "name": "Pretzel, soft" }
        ]
      },
      "flags": { "needs_lookup": true, "needs_portion": false }
    }
  ],
  "totals": {
    "calories_kcal": 300,
    "protein_g": 7,
    "carbs_g": 60,
    "fat_g": 3,
    "fiber_g": null,
    "confidence": 0.62
  },
  "audit": {
    "message_id": "chat-abc123",
    "input_text": "for dinner tonight, I had a large soft pretzel and a 16oz lager",
    "parsed_by": "llm-vX.Y",
    "version": "meal_log_schema@1.3.0"
  }
}
```

---

## 2. Parsing Pipeline

1. **Detect intent** → is the input a meal log?
2. **Segment items** → split on conjunctions ("and," commas, plus signs).
3. **Normalize names & units** → map “16oz” → `{value:16, unit:"oz_fl"}`.
4. **Classify meal type** → based on time or keywords.
5. **Generate lookup candidates** → USDA/brand matches.
6. **Estimate nutrients** → rough macros with confidence scores.
7. **Compute totals** → sum of item estimates.
8. **Persist with audit** → include raw text + parser version.

---

## 3. Examples

### A) Simple input

**Text:** `for dinner tonight, I had a large soft pretzel and a 16oz lager`

```json
{
  "meal_type": "dinner",
  "items": [
    {
      "raw_text": "large soft pretzel",
      "name": "soft pretzel",
      "quantity": { "value": 1, "unit": "count", "display": "large" },
      "size_hint": "large",
      "nutrition_estimate": { "calories_kcal": 300, "protein_g": 7, "carbs_g": 60, "fat_g": 3, "source": "heuristic", "confidence": 0.6 },
      "lookup": { "status": "pending", "candidates": [] },
      "flags": { "needs_lookup": true, "needs_portion": false }
    },
    {
      "raw_text": "16oz lager",
      "name": "lager beer",
      "alcohol": { "is_alcohol": true, "abv_pct": 5, "volume_ml": 473 },
      "quantity": { "value": 16, "unit": "oz_fl", "display": "16 oz" },
      "nutrition_estimate": { "calories_kcal": 200, "carbs_g": 17, "protein_g": 2, "fat_g": 0, "source": "heuristic", "confidence": 0.65 },
      "lookup": { "status": "pending", "candidates": [] },
      "flags": { "needs_lookup": true, "needs_portion": false }
    }
  ]
}
```

### B) Brand + portion

**Text:** `Starbucks grande latte with 2% milk and a blueberry muffin`

- Latte → `{value:16, unit:"oz_fl"}` from "grande".
- Muffin → `needs_lookup:true`, with candidates (Starbucks vs generic).

### C) Vague portion

**Text:** `handful of almonds and half a bag of Doritos (small)`

- Almonds → map “handful”→ \~28g, low confidence.
- Doritos → keep portion as fraction of package.

---

## 4. Validation (Zod Schema)

```ts
import { z } from "zod";

export const Quantity = z.object({
  value: z.number().nullable(),
  unit: z.enum(["count","slice","cup","oz_fl","oz","g","ml","tbsp","tsp","packet","bottle","pint","can","other"]).nullable(),
  display: z.string().nullable()
});

export const Nutrition = z.object({
  calories_kcal: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  fiber_g: z.number().nullable(),
  source: z.enum(["usda","brand","heuristic","user"]).optional(),
  confidence: z.number().min(0).max(1).optional()
});

export const Item = z.object({
  raw_text: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  preparation: z.array(z.string()).optional(),
  quantity: Quantity,
  size_hint: z.enum(["small","medium","large"]).nullable(),
  alcohol: z.object({
    is_alcohol: z.boolean(),
    abv_pct: z.number().nullable(),
    volume_ml: z.number().nullable()
  }).partial().optional(),
  nutrition_estimate: Nutrition.optional(),
  lookup: z.object({
    status: z.enum(["pending","matched","ambiguous"]),
    candidates: z.array(z.object({
      provider: z.string(),
      id: z.string(),
      name: z.string()
    })).default([])
  }),
  flags: z.object({
    needs_lookup: z.boolean().default(false),
    needs_portion: z.boolean().default(false)
  }).default({ needs_lookup: false, needs_portion: false })
});

export const MealLog = z.object({
  user_id: z.string(),
  logged_at_iso: z.string(),
  meal_type: z.enum(["breakfast","lunch","dinner","snack","drink","unknown"]),
  context_note: z.string().optional(),
  items: z.array(Item).min(1),
  totals: Nutrition.optional(),
  audit: z.object({
    message_id: z.string().optional(),
    input_text: z.string(),
    parsed_by: z.string().optional(),
    version: z.string().optional()
  })
});
```

---

## 5. LLM Prompting

- Always return valid JSON only.
- Keep `raw_text` for each item.
- Normalize volumes/weights; preserve vague terms in `quantity.display`.
- Set unknowns to `null` with `flags.needs_lookup=true`.
- Do not invent brands.

**Example Prompt:**

```
Convert this text into MealLog JSON:
Text: "for dinner tonight, I had a large soft pretzel and a 16oz lager"
UserId: densign
```

---

## 6. Update & Merge Rules

- If user supplies new brand/weight/portion, patch matching `items[i]` by `raw_text` similarity + time window.
- When `lookup.status` becomes `matched`, recompute `nutrition_estimate` and `totals`.
- Maintain an `edits[]` changelog if needed.

---

## 7. Unit Normalization Cheatsheet

- Pint = 16 oz\_fl = 473 ml
- Can (standard beer/soda) = 12 oz\_fl = 355 ml
- Handful (nuts) = \~28 g (low confidence)
- Cup = 240 ml, tbsp = 15 ml, tsp = 5 ml

---

**End of Instructions**

