---
aliases: [Apollo, Dự án Apollo]
tags:
  - project/apollo
  - project/active
status: đang làm
owner: "[[Minh]]"
deadline: 2026-12-15
---
# Dự án Apollo

Nền tảng dữ liệu dùng chung. Xem bối cảnh ở [[2026-10-02 Họp Apollo]].

## Mục tiêu

- Hợp nhất ba nguồn dữ liệu rời rạc
- Giảm thời gian truy vấn xuống dưới 200ms
- Có [[Liên kết hai chiều]] giữa entity để dễ truy vết

## Phụ thuộc

| Note | Vai trò |
|---|---|
| [[Dự án Aurora]] | tiêu thụ dữ liệu |
| [[Dự án Atlas]] | hạ tầng chạy |
| [[Kiến trúc dữ liệu]] | thiết kế |
| [[Thử nghiệm tải]] | kiểm chứng |

## Việc đang mở

- [ ] Chốt schema với [[Huy]]
- [ ] Viết [[Thử nghiệm tải]] cho 1 triệu bản ghi
- [x] Dựng môi trường staging — xem [[Môi trường]]

## Liên quan

[[Roadmap 2026]] · [[Kế hoạch quý 4]] · [[Quyết định 001 - chọn Postgres]] · [[PARA method]]

#project/apollo #work
