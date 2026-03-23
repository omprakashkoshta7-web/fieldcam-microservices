FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
RUN npm rebuild sharp
COPY src ./src
RUN mkdir -p uploads
EXPOSE 10000
ENV PORT=10000
CMD ["node", "src/server.js"]
