# NetGuard Manager — Code Map

เอกสารนี้เป็นจุดเริ่มต้นสำหรับหาไฟล์ที่ต้องแก้ หลีกเลี่ยงการใส่ logic ข้ามหน้าที่ของแต่ละส่วน

```text
index.js                         จุดเริ่มต้นโปรแกรมเท่านั้น
server/
  create-app.js                  สร้าง Express app, middleware และ routes
  start.js                       เปิด server, database, poller และ graceful shutdown
config.js                        อ่าน environment variables ทั้งหมด
middleware/
  guard.js                       IP allowlist, password และ session
routes/
  auth.js                        login / logout / session status
  api.js                         HTTP endpoints ของ dashboard
services/
  docker.js                      สร้างและควบคุม bot / Cloudflare containers
  meta.js                        อ่านและเขียนข้อมูลลูกค้าใน meta.json
  stats-db.js                    SQLite schema และคำสั่งสถิติ
  poller.js                      ดึง /stats ของ bot ทุก 5 นาที
  logger.js                      รูปแบบ log กลาง
public/
  index.html                     โครงสร้าง Dashboard และ modal markup
  login.html                     หน้าเข้าสู่ระบบ
  css/
    theme.css                    สีและ font tokens
    layout.css                   โครงสร้างหน้าหลักและ responsive layout
    components.css               ปุ่ม ตาราง modal และ form components
  js/
    core/dom.js                  DOM references ทั้งหมด (ห้าม query ซ้ำใน feature)
    core/state.js                state ที่เปลี่ยนระหว่างใช้งาน Dashboard
    api.js                       เรียก REST API และโหลดข้อมูล
    render.js                    แสดงผลตาราง summary และ charts
    modals.js                    พฤติกรรม modal ทั้งหมด
    app.js                       ผูก events และเริ่ม Dashboard
```

## หลักการแก้โค้ด

- เพิ่ม endpoint: แก้ `routes/` แล้วเรียก service ที่เกี่ยวข้อง; ไม่ใส่ Docker หรือ SQL ใน route
- เพิ่ม logic Docker: แก้ `services/docker.js`; route ไม่ควรรู้ Docker API detail
- เพิ่มข้อมูลสถิติ: แก้ `stats-db.js` และ `poller.js`
- เพิ่ม component ในหน้าเว็บ: markup อยู่ `index.html`, style อยู่ `css/components.css`, event อยู่ `js/app.js` หรือ `js/modals.js`
- ข้อมูลที่หน้าจอใช้ร่วมกันต้องอยู่ `js/core/state.js`; element ใหม่ต้องประกาศใน `js/core/dom.js`

## ลำดับการทำงาน

```text
Browser → public/js/api.js → routes/api.js → services/* → Docker / SQLite
Browser → public/js/render.js ← state.js ← public/js/api.js
index.js → server/start.js → server/create-app.js → routes/*
```
