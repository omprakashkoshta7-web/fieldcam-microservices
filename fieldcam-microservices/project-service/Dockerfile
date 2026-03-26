FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY project-service/package.json ./package.json
COPY project-service/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
RUN npm rebuild sharp
COPY project-service/src ./src
RUN mkdir -p uploads
EXPOSE 10000
ENV PORT=10000
CMD ["node", "src/server.js"]
