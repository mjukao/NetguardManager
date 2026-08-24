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

ยังไม่ทำ:
- meta.json เก็บข้อมูลลูกค้า (ชื่อบริษัท ผู้ติดต่อ วันหมดสัญญา)
- SQLite เก็บสถิติ uptime/alert ย้อนหลัง
- ตั้ง MANAGER_PASSWORD_HASH จริง (ตอนนี้ยังเป็น default admin)
- push ขึ้น GitHub (ยังไม่มี remote)
- ยังไม่ทดสอบบน Linux server จริง

## หลักการตัดสินใจ
- Docker เป็น source of truth — ไม่เก็บ state ซ้ำใน DB
  จะใส่ DB เมื่อต้องเก็บสถิติย้อนหลังเท่านั้น
- ข้อมูลลูกค้าใช้ meta.json ข้างๆ .env ก็พอ ไม่ต้อง DB

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

## คำสั่งที่ใช้บ่อย
cd "D:\Project Code\NetguardManager"
docker compose up -d --build
docker compose ps
docker compose logs manager --tail 30
Dashboard: http://localhost:8080 (รหัส default: admin)

## วิธีทำงานที่ต้องการ
- ทำทีละเฟส ไม่ข้ามขั้น
- เจอ error ให้หยุดรายงานทันที ไม่แก้เอง
- ก่อน commit ตรวจ git check-ignore .env
- ทดสอบจริงเสมอ ไม่ใช่แค่ syntax check
- ลบ test artifacts (cookies.txt, test bot) หลังทดสอบเสร็จ
