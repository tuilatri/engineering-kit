> **⚠️ v0.1 REFERENCE COPY — do not use as-is in new projects.** This file
> describes the `verify.mjs` / `doc-truth.mjs` copies under `example/scripts/`,
> which still have gates/claims HARDCODED for the seed repo. The kit template
> now ships config-driven `template/scripts/verify.mjs` / `doc-truth.mjs` that
> read gates/claims from `kit.config.json` (field reference:
> `kit.config.schema.json`) — no script editing needed. This hardcoded
> reference is kept so you can study more complex gate patterns (venv
> preflight, per-file line counts, pytest collect-only, ...) and port them
> into your `kit.config.json` gates.

# CONFIGURE — đọc trước khi dùng verify.mjs / doc-truth.mjs

Cả 2 script đang chứa gates/claims hardcoded cho repo seed (3 apps BooK).
Dành cho dự án mới:

1. `verify.mjs`: sửa mảng `GATES` (mỗi gate = spawn spec) hoặc thêm flag đọc
   `verify.gates.json` (khuyến nghị nâng cấp config-driven)
2. `doc-truth.mjs`: sửa mảng `CLAIMS` (mỗi claim = { doc, re, kind }) — regex
   neo vào heading/bảng của docs/ai-context BẢN CỦA BẠN
3. Quy ước đo dòng: non-empty lines (CRLF-strip, KHÔNG trim) — xem docstring
4. Number format: dot-separator "5.670" = 5670 (docNum() strip dots)
