FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p uploads
EXPOSE 10000
ENV PORT=10000
CMD ["node", "src/server.js"]
