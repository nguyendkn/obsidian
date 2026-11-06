---
tags: [concept/tag]
---
# Tag hierarchy

Tag lồng bằng dấu `/`: `#project/apollo` sinh ra tag cha `#project`.

## Ví dụ

- `#project/apollo`, `#project/aurora`, `#project/atlas` → cha chung `#project`
- `#area/health`, `#area/finance` → cha `#area`

Đếm tag toàn vault lấy từ `MetadataCache.getTags()`, gộp theo chữ thường và giữ cách viết phổ biến nhất.

Xem [[Liên kết hai chiều]].

#concept/tag
