---
name: book-collection-conventions
description: Use when writing, changing, or reviewing code in backend/, frontend/, or mobile/ of the book-collection repo. Covers the three-layer decision, the snapshot-on-every-write cost, why there are no aggregate columns, the dual-image pipeline, intake security invariants, and which test gate applies to which app. Also use when touching intake/upload flows, the Excel engine, storage quota, or before adding any write path.
metadata:
  scope: backend/, frontend/, mobile/
---

# Book Collection — Conventions

Quy tắc làm việc trong repo này. `AGENTS.md` là hợp đồng, file này là **thứ
gọi ra khi đang viết code**. Chi tiết tra cứu ở `docs/ai-context/`.

## Rule 0 — Chọn tầng TRƯỚC khi sửa

Repo có **3 app độc lập**, không shared package. "Sửa ảnh bìa hiện sai" có
thể nằm ở:

| Tầng | File | Khi nào chạm |
|---|---|---|
| backend | `backend/app/services/image_service.py` | encode WebP, thumbnail, validate |
| frontend | `frontend/src/lib/api.ts` | dựng URL, fallback placeholder |
| mobile | `mobile/src/services/imageOptimizer.ts` | nén trước khi gửi |

Cùng một triệu chứng, ba chỗ sửa khác nhau. Hỏi "tầng nào" trước khi mở file.

## Rule 1 — Mọi thao tác ghi tốn một snapshot toàn database

`BackupService.create_snapshot()` serialize **cả 5 bảng** ra JSON rồi gzip.
Đo được ~0,19 s / ~182 KB cho **một lần sửa 1 tập sách**.

Đặt nó **một lần, ở cuối, sau khi mọi ghi đã thành công**. Không đặt ở giữa.

Thêm batch endpoint thì theo đúng pattern đã có:

```python
for item in req.items:
    await cls.create_book_without_backup(...)   # không snapshot
...
await BackupService.create_snapshot("BATCH_CREATE", "BOOKS", None)  # 1 lần
```

Mẫu tham chiếu: `books.py` route `/batch`, `test_intake_batch.py` chốt
"≤1 snapshot mỗi batch".

## Rule 2 — Không thêm cột tổng hợp vào DB

`series.total_volumes`, `owned_count` **không tồn tại trong schema và không được
thêm**. Mọi thống kê tính động trong `series_service.py` từ bảng `books`:
số tập đã có, số tập unique, số bản vật lý, tập thiếu (quét `1..max`).

Nếu thấy ai đó đề xuất denormalize, đó là quyết định thiết kế cần bàn riêng —
không là việc làm vặt trong một task khác.

**Tiền lệ P2-5 (21/10):** `completion_rate_percent` cần mẫu số = "tập lớn nhất
đang sở hữu" mà **không cần** cột mới — `max_volume` **đã có sẵn** trong logic
quét `1..max` của `missing_volumes`; chỉ tách ra 1 helper (`_max_volume`) dùng
chung 2 nơi. Trước khi đề xuất thêm cột, **đọc lại** những gì service đã tính sẵn.

## Rule 3 — Pipeline ảnh: 3 file mỗi ảnh, và kiểm quota TRƯỚC khi ghi

```
storage/raw/{category}/{uuid}.{ext}        bản gốc, giữ nguyên
storage/web/{category}/{uuid}.webp         ≤1400px, q85
storage/web/thumbnails/{category}/{uuid}.webp   300×420, q80
```

DB chỉ giữ `raw_image_path` + `web_image_path`. **Đường dẫn thumbnail không
lưu** — nó được tính lại. Vì vậy dọn rác phải so khớp theo **stem**, không theo
tên file (raw giữ `.png`, web luôn `.webp`).

`StorageQuotaService.check_headroom()` **phải chạy trên tổng batch trước khi
ghi file nào**. Nếu kiểm trong loop thì vài file đã nằm trên đĩa sẽ thành mồ
côi khi batch bị từ chối giữa chừng. `test_storage_quota.py` có test riêng cho
tính nguyên tử này.

## Rule 4 — Bảo mật intake: đừng sửa, chỉ đọc comment

`backend/app/services/intake_service.py` + `api/intake.py`. Năm điều đã có
24 test bảo vệ trong `test_intake_security.py`:

| Bất biến | Vì sao |
|---|---|
| PIN dùng `secrets`, so sánh `secrets.compare_digest` | chống brute force + timing leak |
| Lockout tại `INTAKE_MAX_PAIR_ATTEMPTS`; **PIN đúng cũng bị từ chối** khi đã khoá | nếu không, lockout vô nghĩa |
| `paired_client_ip` ghim **đúng một lần, không bao giờ re-bind** | re-bind cho phép chiếm phiên qua probe endpoint |
| WebSocket cố ý **không** IP-restricted | thắt chặt thêm sẽ giết nhầm PC |
| `max_files_per_batch` do **server advertise** (`maxb` trong QR) | mobile chunk theo giá trị thật, không hardcode |

Nếu task bảo sửa vùng này: đọc comment trong source trước. Chúng giải thích
**vì sao một cách sửa trực giác là sai**.

## Rule 5 — Test gate khác nhau theo app

| App | Lệnh | Kỳ vọng |
|---|---|---|
| `backend/` | `pytest tests/ -v` | **360 passed** |
| `frontend/` | `npm test && npm run lint && npm run build` | 158 vitest (8 file) + type-check |
| `mobile/` | `npm test && npx tsc --noEmit` | 44 vitest + type-check |

**Không bao giờ** báo "đã test" sau khi chỉ chạy `npm run build`.
Test chỉ phủ **logic thuần** (`src/lib` FE, `src/services` mobile) — **không** phủ component/UI.

Con số 360 = 355 hàm + 5 bản sao từ 1 test parametrize 6 lần
(`test_orphan_images.py:255`). Chi tiết `docs/ai-context/TESTING_GUIDE.md` §1.1.

`conftest.py` có guard `assert "Test" in DATABASE_URL` **trước khi import app**.
Đừng làm yếu nó — đó là thứ cho phép test xoá dữ liệu hàng loạt.

## Rule 6 — Bẫy đã biết, đừng "sửa"

| Bẫy | Sự thật |
|---|---|
| class `animate-in` `fade-in` `zoom-in-95` `custom-scrollbar` | **không được định nghĩa**, dùng ở 10 file, là no-op |
| `tailwind.config.ts` | **không tồn tại** — Tailwind v4 CSS-first trong `globals.css` |
| `frontend/public/` | **không tồn tại** — `/placeholder-book.png` sẽ 404 |
| `/storage` trả 401 khi file không tồn tại | **cố ý** — chặn existence oracle |
| chip "Bảo mật Master Key" ở Navbar | **mô tả đặc tính**, không phải trạng thái — Master Key luôn hợp lệ khi app chạy (`core/config.py` chặn boot) nên không có gì để đo |
| `ui/slider.tsx` | **đã xoá ở P2-7** (0 consumer) — đừng tạo lại |
| `ui/input.tsx` | **7 consumer** (login · 3 form · 2 modal · SpreadsheetGrid) — tracker từng ghi nhầm là "chết", **đừng xoá** |
| kéo-thả phụ kiện | **không có** trong UI, dù endpoint backend tồn tại |

## Rule 7 — Trước khi kết luận "xong"

```bash
node scripts/doc-truth.mjs           # số liệu trong docs có khớp thực tế không
cd backend  && pytest tests/ -q          # 266 passed, không mất item nào
cd frontend && npm test && npm run build
cd mobile   && npm test && npx tsc --noEmit
gitnexus detect_changes({scope: "compare", base_ref: "main"})
```

Rồi cập nhật `docs/ai-context/*` nếu thay đổi có đụng chữ ký endpoint, số
dòng, hay danh sách dead code — bảng **Doc Trigger** trong `AGENTS.md` liệt kê
file nào bắt buộc cập nhật.

⚠️ **Số liệu trong docs phải ĐO, không tin tracker** — đã sai 6 lần trong 1 phiên
(21/10). `node scripts/doc-truth.mjs` tự so số dòng / số file / số test với thực
tế; chạy nó **trước khi kết luận xong**. Nếu báo sai ⇒ sửa đúng dòng đó, đừng
nới lỏng gate.
