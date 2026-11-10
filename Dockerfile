FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m venv /opt/ytdlp && /opt/ytdlp/bin/pip install --no-cache-dir -r backend/requirements.txt
COPY backend /app/backend
COPY dist/link-import.js /app/dist/link-import.js
COPY package.json /app/package.json
ENV RUBIUU_PYTHON=/opt/ytdlp/bin/python NODE_ENV=production PORT=8788
USER node
EXPOSE 8788
CMD ["node","backend/server.mjs"]
