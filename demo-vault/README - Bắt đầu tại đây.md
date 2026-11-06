---
aliases: [README, Hướng dẫn]
tags: [meta]
---
# README — Bắt đầu tại đây

Đây là vault mẫu để thử **graph view** và các tính năng metadata của Obsidian.

## Nên bấm gì trước

1. Mở **[[Home]]** — hub trung tâm, gần như mọi note đều nối về đây.
2. Mở **Graph view** (biểu tượng mạng nhện) và bật *tags* + *attachments*.
3. Bấm chuột vào một node để mở **local graph** quanh note đó.
4. Thử tìm trong graph: `tag:#project`, `path:10 Projects`, `-file:Daily`.

## Vault này cố tình chứa

| Thứ | Ở đâu | Để làm gì |
|---|---|---|
| Hub / MOC | [[MOC - Tri thức]], [[MOC - Công việc]] | kiểm tra node bậc cao |
| Tag lồng | `#project/apollo`, `#area/health` | kiểm tra sinh tag cha |
| Tag frontmatter | YAML `tags:` | kiểm tra `collectTags` |
| Embed | ảnh trong `Attachments/` | node attachment |
| Link hỏng | [[Vườn ý tưởng]] | bảng *Unresolved links* |
| Note mồ côi | `00 Inbox/Ghi chú mồ côi`, `00 Inbox/Nháp riêng` | tuỳ chọn *orphans* |
| Chu trình link | [[Dự án Apollo]] ⇄ [[Dự án Aurora]] | kiểm tra BFS local graph |

Ghi chú gốc: #meta
