# NetGuard Manager

## ภาพรวม
Dashboard จัดการบอทหลายตัวบน server เดียว
- คุม container ของ image phattadol358/netguard-ai:latest
- โปรเจกต์ bot อยู่ที่ D:\Project Code\LineBot (คนละ repo)
- 1 ลูกค้า = 1 bot container + 1 cloudflared container

## Architecture
- manager รันใน container, mount /var/run/docker.sock
- ทุก container join network netguard-net (ตั้งชื่อตายตัวใน compose)
- manager คุยกับ bot ผ่าน Docker DNS (container name) ไม่ใช่ localhost
- ไฟล์ bot: BOTS_HOST_PATH/<name>/{.env,data,logs}
- BOTS_ROOT = path ใน container (สำหรับ fs)
  BOTS_HOST_PATH = path บน host (สำหรับ bind mount)
  ต่างกันเพราะ dockerode ส่ง bind ให้ daemon บน host resolve
- ชื่อ container: netguard-<name> และ netguard-<name>-cloudflared
- Label: netguard.managed=true, netguard.botname=<name>,
  netguard.role=tunnel (เฉพาะ cloudflared)
- ไฟล์ bots/<name>/meta.json เก็บข้อมูลลูกค้า (ข้างๆ .env):
  {
    "companyName": "...", "contactName": "...", "contactPhone": "...",
    "contractEnd": "YYYY-MM-DD", "note": "...",
    "createdAt": "ISO string", "updatedAt": "ISO string"
  }
  ทุก field optional ยกเว้น createdAt, เขียนแบบ atomic (.tmp แล้ว rename)
- SQLite (better-sqlite3) เก็บสถิติ uptime/problems ย้อนหลัง — /app/data/stats.db
  mount เป็น named volume `manager-data` (ไม่ใช้ BOTS_HOST_PATH bind mount
  เพราะเป็นไฟล์ binary ของ manager เอง ไม่ต้องแก้จาก host + เลี่ยงปัญหา
  host path บน Windows + ไม่ต้องเพิ่ม env var ใหม่)
  poller.js poll ทุก bot ทุก 5 นาทีผ่าน Docker DNS (netguard-<name>:3000/stats)
  timeout 10 วิ, ใช้ Promise.allSettled ไม่ให้ bot ช้าบล็อกตัวอื่น

  schema:
    samples(bot_name, ts, state, partial, problems_*, hosts/aps/switches/cameras_total+up)
      — raw sample ทุก 5 นาที เก็บ 60 วัน (pruneOldSamples ลบเก่ากว่านั้น)
    daily(bot_name, day, samples, up_count, down_count, unknown_count,
          uptime_pct, avg_problems, max_problems) — เก็บถาวรไม่ลบ

  ความหมาย state:
    up      = /stats ตอบ 200 และ ok:true
    down    = /stats error/timeout หรือ container ไม่ running
    unknown = manager เองไม่ได้ poll (restart/downtime ของ manager)
    → uptime_pct = up / (up + down) เท่านั้น ไม่นับ unknown เป็น downtime
      เพราะ unknown เป็นความผิดของ manager ไม่ใช่ bot

  ตอน manager start: fillUnknownGaps() เติม sample unknown ย้อนหลังถ้า
  gap จาก sample ล่าสุด > 2 รอบ poll (10 นาที) จำกัด 288 แถว/bot (1 วัน)
  rollupDaily() รันตอนเที่ยงคืน (เช็คทุกชั่วโมงว่าข้ามวันหรือยัง) + ตอน
  manager start (เผื่อ miss ตอนดับ) แล้วตามด้วย pruneOldSamples()

## ความปลอดภัย
- docker.sock = สิทธิ์เทียบเท่า root บน host
- เข้าถึงเฉพาะ Tailscale VPN (100.64.0.0/10) + private LAN
- ห้ามผูก Cloudflare Tunnel เข้า manager เด็ดขาด
- guard 2 ชั้น: network range + session auth (timingSafeEqual)
- rate limit login 5 ครั้ง/15 นาที
- validate ทุก input: BOT_NAME_RE, port range, token format,
  path traversal guard ตอนลบไฟล์

## สถานะ
เฟส 1 (ccbd46e): scaffold + guard + auth + read-only API + Dashboard UI
เฟส 2 (21a0ce0): create/start/stop/restart/remove + shared network
เฟส 3 (dc208b3): cloudflared ต่อ bot + attach/detach + Tunnel column
เฟส 4: meta.json เก็บข้อมูลลูกค้าต่อ bot + คอลัมน์ลูกค้า + badge เตือนสัญญา
เฟส 5: SQLite เก็บสถิติ uptime/problems ย้อนหลัง + poller ทุก 5 นาที +
  Dashboard แสดง Uptime 30 วัน + modal กราฟ (Chart.js) เมื่อคลิกแถว bot

ยังไม่ทำ:
- ยังไม่ทดสอบบน Linux server จริง

## หลักการตัดสินใจ
- Docker เป็น source of truth — ไม่เก็บ state ซ้ำใน DB
  จะใส่ DB เมื่อต้องเก็บสถิติย้อนหลังเท่านั้น
- ข้อมูลลูกค้าใช้ meta.json ข้างๆ .env ก็พอ ไม่ต้อง DB
- ข้อมูลไม่โตตามเวลา (1 ต่อ 1 กับ bot, เปลี่ยนไม่บ่อย) → เก็บเป็นไฟล์
  ข้อมูลโตตามเวลา (log, สถิติย้อนหลัง, เหตุการณ์สะสม) → ต้องใช้ DB

## บทเรียนที่เจอมาแล้ว (อย่าพลาดซ้ำ)
- localhost ใน container ของ manager ≠ host
  → ใช้ container name ผ่าน Docker DNS
- Docker Desktop/WSL2 ไม่ enforce network isolation
  แต่ Docker Engine บน Linux enforce
  → bot ต้อง join network เดียวกับ manager
- express.static เสิร์ฟไฟล์ทะลุ auth guard ได้
  → guard route / และ /index.html แยกต่างหาก
- cookie secure flag: อย่าบังคับใน production
  เพราะ Tailscale/LAN ไม่มี TLS
- docker-compose environment ต้องใช้ ${VAR} จาก .env
  ไม่ hardcode ไม่งั้นแก้ .env แล้วไม่มีผล
- curl normalize ../ ทิ้งก่อนถึง server
  → ทดสอบ path traversal ต้องใช้ %2e%2e%2f
- อย่าใช้ taskkill /F /IM node.exe (ฆ่า process อื่นด้วย)
- ไม่มี .dockerignore มาก่อน → COPY . . ใน Dockerfile จะทับ node_modules
  ที่เพิ่ง npm install ถูกต้องสำหรับ Linux ด้วย node_modules จาก host (Windows)
  พังเงียบๆ เฉพาะตอนมี native module (เช่น better-sqlite3) — ต้องมี
  .dockerignore ที่ exclude node_modules เสมอ
- native module (better-sqlite3) require() สำเร็จได้แม้ ABI ไม่ตรง
  Node version แต่จะ segfault (exit 139) ตอนเรียกใช้งานจริง — เจอ error
  แบบนี้ให้เช็ค engines ใน package.json ของ dependency ก่อน ไม่ใช่แค่ดู
  ว่า npm install ผ่านหรือ require ผ่าน (better-sqlite3@13 ต้องการ
  Node >=22 แต่ base image เดิมเป็น node:20-alpine)
- listBots() ตรวจจับ bot จาก image ตรงกับ botImage ด้วย (ไม่ใช่แค่ label
  netguard.managed) → container อื่นที่ใช้ image เดียวกันโดยบังเอิญ
  (เช่น dev container ของโปรเจกต์ bot เอง) จะโผล่ในตาราง/ถูก poll ด้วย
  แม้ manager ไม่ได้เป็นคนสร้าง — ไม่ crash แต่ควรรู้ไว้

## คำสั่งที่ใช้บ่อย
cd "D:\Project Code\NetguardManager"
docker compose up -d --build
docker compose ps
docker compose logs manager --tail 30
Dashboard: http://localhost:8080 (รหัสตั้งไว้แล้วใน .env)

สร้าง password hash จริง (แทน default admin):
node scripts/gen-password.js "<รหัสผ่านที่ต้องการ>"
→ copy hash ที่ได้ไปใส่ MANAGER_PASSWORD_HASH ใน .env แล้ว docker compose up -d --build ใหม่

## วิธีทำงานที่ต้องการ
- ทำทีละเฟส ไม่ข้ามขั้น
- เจอ error ให้หยุดรายงานทันที ไม่แก้เอง
- ก่อน commit ตรวจ git check-ignore .env
- ทดสอบจริงเสมอ ไม่ใช่แค่ syntax check
- ลบ test artifacts (cookies.txt, test bot) หลังทดสอบเสร็จ
