FROM node:22-alpine

WORKDIR /app

# better-sqlite3 เป็น native module ต้อง compile ตอน npm install
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "index.js"]
