# FlashCard Creator

Công cụ tạo **flashcard học cụ** dành cho học sinh cấp 1 theo phương pháp **Montessori**.  
Chạy hoàn toàn offline — một file HTML duy nhất, không cần cài đặt, không cần server.

---

## Tính năng

- **Nhiều layout** — 13 kiểu bố cục: 1 ảnh, 2×2, ảnh + văn bản, 8 cặp ảnh-chữ, v.v.
- **Soạn thảo trực tiếp** — nhập tiêu đề, nội dung có hỗ trợ Markdown, giữ nguyên thụt đầu dòng
- **Hình ảnh** — tìm ảnh Wikimedia, upload từ máy, hoặc paste URL
- **In & xuất PDF** — in trực tiếp hoặc xuất file PDF
- **Font linh hoạt** — chỉnh font, cỡ chữ, màu, line-height, căn lề (L/C/R/Justify) cho tiêu đề và nội dung
- **Căn dọc văn bản** — top / middle / bottom
- **Padding riêng** — padding chữ và padding ảnh tách biệt
- **Lưu/mở project** — lưu JSON vào thư mục làm việc, tự động restore lần mở sau
- **Zoom preview** — xem trước với zoom 25%–300%
- **Custom CSS** — inject CSS tuỳ chỉnh cho từng session

---

## Cách dùng

1. Mở `FlashCardApp2/FlashCard Creator.html` trong trình duyệt (Chrome/Edge khuyến nghị)
2. Chọn thư mục làm việc (nút **📁 Set Folder**) để lưu project
3. Bấm **+ New Card** để thêm card, chọn layout phù hợp
4. Nhập nội dung, thêm ảnh, chỉnh font/màu
5. Bấm **Print / Export PDF** để in hoặc lưu PDF

---

## Layouts

| Layout | Mô tả |
|---|---|
| `2top-1bot` | 2 ảnh trên, 1 ảnh dưới |
| `1top-2bot` | 1 ảnh trên, 2 ảnh dưới |
| `1big-2small` | 1 ảnh lớn trái, 2 ảnh nhỏ phải |
| `2x2` | Lưới 2×2 |
| `1full` | 1 ảnh toàn trang |
| `fullimage` | Ảnh tràn viền, có padding riêng |
| `fulltext` | Chỉ văn bản, không có ảnh |
| `1left-2right` | 1 ảnh trái, 2 ảnh phải |
| `1left-3right` | 1 ảnh trái hẹp, 3 ảnh phải |
| `1top-3bot` | 1 ảnh trên, 3 ảnh dưới |
| `1top-1bot` | 1 ảnh trên, 1 ảnh dưới |
| `2img-2txt` | 2 ảnh + 2 ô chữ trong lưới |
| `8img-8txt` | 8 cặp ảnh + chữ (portrait 2×8, landscape 4×4) |

---

## Build từ source

```bash
# Chỉnh sửa trong src/, sau đó build:
node build.js

# Hoặc tự động rebuild khi có thay đổi:
node watch.js
```

Output: `index.html` + `FlashCardApp2/FlashCard Creator.html`

---

## Cấu hình (`src/config.js`)

| Key | Mặc định | Mô tả |
|---|---|---|
| `paperSize` | `A5` | A4 / A5 / A6 / Letter |
| `orientation` | `portrait` | portrait / landscape |
| `margin` | `9` mm | Khoảng cách mép giấy → viền card |
| `padding` | `2` mm | Padding văn bản |
| `imgPadding` | `0` mm | Padding ảnh |
| `textVAlign` | `middle` | Căn dọc chữ: top / middle / bottom |
| `border` | double / tím | Width, style, color, radius |
| `maxImgPx` | `1240` | Nén ảnh về kích thước tối đa (px) |

---

## Yêu cầu

- Trình duyệt hiện đại hỗ trợ **File System Access API** (Chrome 86+, Edge 86+)
- Không cần internet (ngoại trừ tìm ảnh Wikimedia)
