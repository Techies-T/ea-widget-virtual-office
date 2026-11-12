FROM node:24-alpine

WORKDIR /app

# Native build deps for sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN if [ ! -f dist/index.html ]; then npm run build; fi

ENV NODE_ENV=production
ENV PORT=8091
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data

EXPOSE 8091

CMD ["node", "server/index.cjs"]
