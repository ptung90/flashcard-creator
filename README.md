# FlashCard Creator

Công cụ tạo **flashcard học cụ** dành cho học sinh cấp 1 theo phương pháp **Montessori**.  
Chạy hoàn toàn offline — một file HTML duy nhất, không cần cài đặt, không cần server.

---

## Tính năng

- **18 layout** — 1 ảnh, 2×2, ảnh + văn bản, lưới chữ, 8 cặp ảnh-chữ, v.v.
- **Soạn thảo trực tiếp** — tiêu đề, nội dung có hỗ trợ Markdown và HTML passthrough
- **Hình ảnh** — tìm ảnh Wikimedia / iNaturalist / Pixabay / Unsplash, upload, paste URL, paste từ clipboard
- **In & xuất PDF** — in từng card hoặc tất cả, xuất PDF
- **Font linh hoạt** — font, cỡ chữ, màu, line-height, căn lề cho tiêu đề và nội dung (global + per-card)
- **Căn dọc văn bản** — top / middle / bottom
- **Lưu/mở project** — lưu JSON vào thư mục làm việc, tự động restore lần mở sau, backup tự động
- **Records & Schema** — quản lý dữ liệu dạng bảng, pack vào card hàng loạt
- **AI Chat** — tạo nội dung card bằng AI (OpenAI / Gemini)
- **Undo/Redo** — lịch sử thay đổi
- **Zoom preview** — xem trước 25%–300%
- **Custom CSS** — per-card và global

---

## Cách dùng

1. Mở `FlashCardApp/FlashCard Creator.html` trong trình duyệt (Chrome/Edge)
2. Chọn thư mục làm việc (nút **📁 Set Folder**) để lưu project
3. Bấm **+ New Card**, chọn layout
4. Nhập nội dung, thêm ảnh, chỉnh font/màu
5. Bấm **Print / Export PDF**

---

## Layouts

| Layout | Slots | Mô tả |
|---|---|---|
| `2top-1bot` | 3 | 2 ảnh trên, 1 ảnh dưới |
| `1top-2bot` | 3 | 1 ảnh trên, 2 ảnh dưới |
| `1big-2small` | 3 | 1 ảnh lớn trái, 2 ảnh nhỏ phải |
| `2x2` | 4 | Lưới 2×2 |
| `1full` | 1 | 1 ảnh toàn trang |
| `fullimage` | 1 | Ảnh tràn viền, padding riêng |
| `fulltext` | 0 | Chỉ văn bản |
| `1left-2right` | 3 | 1 ảnh trái, 2 ảnh phải |
| `1left-3right` | 4 | 1 ảnh trái hẹp, 3 ảnh phải |
| `1top-3bot` | 4 | 1 ảnh trên, 3 ảnh dưới |
| `1top-1bot` | 2 | 1 ảnh trên, 1 ảnh dưới |
| `2img-2txt` | 2 | 2 ảnh + 2 ô chữ |
| `3img-3txt` | 3 | 3 cột ảnh + chữ |
| `img3-txt3` | 3 | 3 hàng ảnh trái / chữ phải |
| `6cell` | 6 | 6 ô ảnh + chữ (2×3 / 3×2) |
| `txtgrid` | 0 | Lưới chữ thuần |
| `8img-8txt` | 8 | 8 cặp ảnh + chữ (portrait 2×8, landscape 4×4) |

---

## Dev

```bash
npm install

# Dev server với hot reload
npm run dev

# Build ra FlashCardApp/FlashCard Creator.html
npm run build
```

Yêu cầu: copy `src/js/env.example.js` → `src/js/env.js` và điền API keys nếu cần.

---

## Cấu hình (`src/js/core/config.js`)

| Key | Mặc định | Mô tả |
|---|---|---|
| `paperSize` | `A5` | A4 / A5 / A6 / Letter |
| `orientation` | `portrait` | portrait / landscape |
| `margin` | `9` mm | Khoảng cách mép giấy → viền card |
| `padding` | `2` mm | Padding văn bản |
| `imgPadding` | `0` mm | Padding ảnh |
| `textVAlign` | `middle` | Căn dọc: top / middle / bottom |
| `border` | double / xanh lá | Width, style, color, radius |
| `maxImgPx` | `1240` | Nén ảnh về kích thước tối đa (px) |

---

## Yêu cầu

- Chrome 86+ hoặc Edge 86+ (cần File System Access API)
- Không cần internet (ngoại trừ tìm ảnh và AI)
