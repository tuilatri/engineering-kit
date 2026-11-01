# PROMPT_TEMPLATES.md

Ready-to-paste prompts for recurring tasks in this repo. Fill the `{{}}` slots.
Each template names the context files to load first, so the architecture doesn't
have to be re-explained.

Every template assumes the agent has read [`AGENTS.md`](../../AGENTS.md).

---

## 0. Two rules for every task

1. **Pick the scope before proposing a fix.** "The cover image displays wrong" could live in
   the backend (`image_service`), in the FE (`getImageUrl`), or in mobile
   (`imageOptimizer`). State which layer first.
2. **Every write operation costs a full-database snapshot.** If the task suggests
   adding another write round (one extra write in the middle), stop and say so.

---

## 1. Add or modify a backend endpoint

```text
Endpoint: {{VD: POST /books/batch hoặc thêm field vào PUT /books/{id}}}

Context: đọc docs/ai-context/API_MAP.md (mục books) và ARCHITECTURE.md §2
để hiểu canonical write path.

Steps:
1. Chọn tầng: schema Pydantic → service → router. Không đặt business logic
   trong router.
2. Nếu service ghi DB: gọi create_snapshot() đúng một lần, ở CUỐI, SAU khi
   mọi ghi đã thành công. Xem series_service.create_series làm mẫu.
3. Nếu là batch: dùng *_without_backup rồi snapshot một lần cho cả batch,
   trả {succeeded, failed[{index,label,error}]}. Không để một item lỗi làm hỏng
   cả batch — xem test_intake_batch.py.
4. Nếu chạm FK: nhớ "none" → None cho cả 3 FK nullable, và FK dùng
   onDelete: SetNull nên xoá publisher sẽ set-null chứ không cascade.
5. Thêm test vào backend/tests/. Test mới phải qua được isolation của
   conftest.py — đọc TESTING_GUIDE.md §1 trước.
6. Cập nhật docs/ai-context/API_MAP.md và MODULE_MAP.md nếu thêm file.
7. Verify: `node scripts/verify.mjs` không mất case nào, impact() trước khi sửa.
```

## 2. Add a feature to the frontend

```text
Feature: {{VD: cột "giá trị thị trường" vào SpreadsheetGrid}}

Context: đọc docs/ai-context/FRONTEND_MAP.md §1 và §3 trước.

Steps:
1. Kiểm tra component đã có chưa trong components/ui/ — MANDATORY, không dùng
   <select>/<input> thô cho UI mới.
2. Nếu thêm primitive mới: theo đúng pattern file cũ (forwardRef, cn(),
   export component + export ...Variants nếu là button).
3. Thêm vào types/index.ts nếu là shape mới từ API. Tiền tọa từ Postgres
   numeric là STRING — đừng ép number trước khi formatVND.
4. Fetch: dùng useSWR(key, fetcher) từ lib/swr.ts. 401 tự redirect, không tự xử lý.
5. Sau mutation: gọi refreshAll() theo quy ước onSuccess() → refreshAll().
   Lớp cache SWR đã có sẵn — đừng tự thêm lớp khác.
6. Đừng dùng class animate-in / fade-in / zoom-in-95 / custom-scrollbar —
   chúng không được định nghĩa, là no-op. Xem FRONTEND_MAP.md §5.
7. Verify: npm run lint && npm run build. Đây là gate DUY NHẤT cho FE —
   không có test. Đừng báo "đã test" khi chỉ chạy build.
```

## 3. Add a new route

```text
Route: {{VD: /settings/backup-history}}

Context: FRONTEND_MAP.md §1 xem cách 7 route hiện tại tự bọc AppShell.

Steps:
1. Tạo app/<route>/page.tsx, 'use client' ở đầu file.
2. Tự bọc AppShell — repo KHÔNG dùng route group / nested layout, mỗi page
   tự khai. Đừng thêm layout.tsx trừ khi thật sự cần.
3. Mỗi endpoint một useSWR(key, fetcher) — SWR fetch song song theo key.
   Đừng gom Promise.all.
4. Endpoint phụ: gộp error riêng, đừng đưa vào biến error chung của ErrorPanel
   (settings/page.tsx loại /auth/me khỏi error).
5. Thêm mục vào Navbar navItems.
6. Không cần thêm vào types/index.ts trừ khi shape API mới.
7. Cập nhật FRONTEND_MAP.md §1.
```

## 4. Fix a bug

```text
Symptom: {{lỗi hoặc hành vi sai}}
When: {{luôn / từ ngày / chỉ khi ...}}

Steps:
1. Phân loại trước khi sửa:
   (a) backend logic sai → query({search_query}) rồi context({name}) trên
       symbol cụ thể. Đừng mở cả service.
   (b) frontend chưa xử lý response → kiểm tra types/index.ts có khớp
       API_MAP.md không.
   (c) mobile → IntakeContext / intakeApi.
2. impact({target, direction: "upstream"}) và BÁO blast radius trước khi sửa.
   Cảnh báo nếu HIGH/CRITICAL.
3. Sửa nhỏ nhất giải quyết root cause. Không dọn code bên cạnh.
4. Thêm test hồi quy vào backend/tests/ nếu lỗi ở tầng backend.
5. Verify: `node scripts/verify.mjs`, detect-changes trước commit.
```

## 5. Working with intake / mobile

```text
Change: {{VD: thêm filter theo loại ảnh ở màn review}}

Context: ARCHITECTURE.md §2 (luồng intake) và FRONTEND_MAP.md §2
(state machine của MobileIntakeDialog).

CÁC LUẬT KHÔNG ĐƯỢC PHÁ:
1. PIN so sánh bằng secrets.compare_digest. Lockout tại INTAKE_MAX_PAIR_ATTEMPTS
   phải giữ nguyên, kể cả khi PIN đúng.
2. paired_client_ip ghim MỘT LẦN và không bao giờ re-bind. Code có comment giải
   thích vì sao re-bind là sai — đọc trước khi "sửa".
3. WebSocket cố ý KHÔNG IP-restricted.
4. check_headroom() phải chạy trên TỔNG batch TRƯỚC khi ghi file nào.
5. max_files_per_batch do server advertise. Đổi hằng số ở một đầu mà quên
   đầu kia sẽ phá hợp đồng P1-7.
6. Mobile map 7 category → 2 giá trị wire (books|accessories). Chi tiết
   bookmark/postcard/standee KHÔNG đi qua wire, chỉ chọn lại được trên PC.
7. **Heartbeat (P3-15):** client gửi `{"type":"PING"}` (HOA) và server **nhận cả**
   `"ping"` lẫn `"PING"` (`_is_heartbeat` trong `api/intake.py`). Đừng "siết" lại
   thành so sánh phân biệt HOA/thường — app mobile build cũ sẽ không còn nhận PONG ⇒
   watchdog phía client (P3-14) báo "chết âm thầm" oan.
8. **Vòng đời socket của PC (P3-15):** `ws_manager.connect(...)` **và** `send_json(CONNECTED)`
   phải nằm **TRONG** `try`, và luôn có `finally: disconnect`. Nếu `send_json` lỗi mà
   `disconnect` không chạy ⇒ websocket chết **nằm lại** trong `_connections` ⇒
   `connected_clients` đếm sai. `disconnect` idempotent nên gọi 2 lần vô hại.

Steps: impact trên intake_service hoặc MobileIntakeDialog trước. Thêm test vào
test_intake_security.py nếu đụng vùng auth. **Đổi endpoint WS thì test vào
`test_intake_ws.py`** bằng **fake WebSocket** gọi thẳng endpoint — KHÔNG dùng
`TestClient.websocket_connect` (`receive_json()` chặn vô hạn ⇒ treo cả suite).
Verify: `node scripts/verify.mjs`.
```

## 6. Touching Excel import/export

```text
Task: {{VD: thêm cột mới vào sheet Master_Books_Import}}

WARNING: ExcelService là file lớn nhất backend (781 dòng) và import có
side-effect lên DB thật. Đọc ARCHITECTURE.md §2 về snapshot trước.

Steps:
1. Export và import là hai chiều của CÙNG một shape bảng. Đổi một bên mà
   không đổi bên kia sẽ hỏng round-trip.
2. Import tự chụp snapshot PRE_EXCEL_IMPORT trước khi mutate. Đừng thêm
   snapshot thứ hai.
3. Import phải collect lỗi từng dòng vào errors[] thay vì raise — một dòng
   hỏng không được làm mất toàn bộ lần import.
4. Export build workbook trong asyncio.to_thread. Giữ nguyên, không chuyển
   lại về đồng bộ.
5. Thumbnail: prefer web/thumbnails, fallback web, fallback raw. Cache LRU
   5000 — test_excel_export_perf.py chốt cả cache lẫn thứ tự prefer.
6. Verify: `cd backend && .\.venv\Scripts\python.exe -m pytest tests/test_excel.py tests/test_excel_export_perf.py -v`.
   Cả 2 file phải pass, không được bỏ perf test.
```

## 7. Refactor shared code

```text
Refactor: {{VD: gộp 2 chỗ map nhãn loại phụ kiện bị nhân bản 4 lần}}

Steps:
1. Liệt kê hết các bản sao TRƯỚC khi viết dòng code đầu tiên:
   grep -rn "BOOKMARK" frontend/src/
   Ghi rõ chỗ nào khác nhau — SymmetricalBlocks dùng bản CÓ EMOJI, 3 file
   kia dùng bản chữ thuần. Không phải bản sao nào cũng giống nhau.
2. Prove chúng giống nhau về hành vi trước khi gộp. Chỗ khác nhau thì giữ
   khác nhau và ghi vào docs.
3. Migrate MỘT call site trước, chạy build. Rồi mới làm các chỗ còn lại.
4. Không rename symbol public bằng find-and-replace — dùng gitnexus rename.
5. Cập nhật FRONTEND_MAP.md §6 nếu gộp xong.
```

## 8. Clean up dead code

```text
Task: {{VD: xoá encrypt_data / decrypt_data khỏi core/security.py}}

Context: ARCHITECTURE.md §5 liệt kê dead code của cả 3 app.

Steps:
1. Xác minh bằng graph trước, không tin grep:
   cypher MATCH (n) WHERE n.name = 'encrypt_data' RETURN n.filePath, ...
   Cần thấy 0 caller, không phải "không thấy trong grep".
2. Nêu rõ trước khi xoá: symbol này chết vì chưa ai nối, hay vì đã bị thay
   thế. Hai trường hợp cần ghi khác nhau.
3. Có nguy cơ gì không — ví dụ xoá Fernet thì cơ chế mã hoá biến mất hoàn
   toàn, đó là quyết định chứ không phải dọn code.
4. Nếu KHÔNG chắc, KHÔNG xoá. Ghi vào docs/ai-context/ARCHITECTURE.md §5 và
   để nguyên. Karpathy rule 3: dead code có sẵn thì chỉ nêu, đừng xoá.
```

## 9. Review before commit

```text
Review thay đổi chưa commit của tôi.

1. detect-changes({scope: "compare", base_ref: "main"}) — liệt kê symbol đổi
   và execution flow bị ảnh hưởng.
2. Với mỗi symbol đổi, impact({target, direction: "upstream"}) và báo có caller
   nào nằm ngoài các file tôi đã sửa không.
3. Cảnh báo mọi thay đổi chữ ký endpoint, nhất là endpoint trong API_MAP.md.
4. Xác nhận `node scripts/verify.mjs` pass và KHÔNG mất case nào so với **188 item**
   (TESTING_GUIDE §1.1 giải thích vì sao 183 hàm ≠ 188 item).
5. Xác nhận không file nào trong backend/.env, storage/, storage_test/ bị staged.
6. Xác nhận docs/ai-context/ đã được cập nhật nếu thay đổi có ảnh hưởng tới
   chữ ký, số dòng, hay danh sách dead code.
```

## 10. Onboarding (new agent, no context yet)

```text
Bạn mới với repo này. Đừng bắt đầu sửa gì.

1. Đọc AGENTS.md, rồi docs/ai-context/ARCHITECTURE.md.
2. Repo gồm 3 app chạy song song: FastAPI backend, Next.js frontend, Expo
   mobile. Không có shared package — giao tiếp qua HTTP.
3. Ba điều đặc biệt, phần lớn agent đều sai ở đây:
   - KHÔNG có test nào cho frontend/ và mobile/. Chỉ backend có test.
     Đừng báo "đã test" sau khi chạy npm run build.
   - Mọi thao tác ghi đều sinh snapshot GZIP toàn database. Thêm vòng ghi
     thứ hai là tốn kém thật.
   - KHÔNG lưu total_volumes trong DB. Mọi thống kê tập phải tính động từ
     bảng books — đừng thêm cột tổng hợp.
4. Repo được index bằng GitNexus. Ưu tiên query() để tìm flow, context()
   cho một symbol, impact() trước khi sửa, detect-changes() trước khi commit.
5. Báo lại: 3 app với entry point của từng app, 5 hệ thống lớn nhất
   (dual storage, auto-backup, storage quota, intake bridge, Excel engine),
   rồi 3 chỗ bạn nghĩ rủi ro cao nhất. Sau đó dừng, chờ task.
```

---

## Quick reference — GitNexus calls

| Purpose | Call |
|---|---|
| Find a flow by concept | `query({search_query: "image upload"})` |
| Full view of one symbol | `context({name: "create_snapshot"})` |
| Blast radius before editing | `impact({target: "create_book", direction: "upstream"})` |
| Path between 2 symbols | `trace({from: "intake_upload", to: "process_and_save_image"})` |
| Review before commit | `detect_changes({scope: "compare", base_ref: "main"})` |
| Raw graph query | `cypher({statement: "MATCH (n:Function) RETURN n.name LIMIT 50"})` |
| Check import cycles | `check({cycles: true})` |
