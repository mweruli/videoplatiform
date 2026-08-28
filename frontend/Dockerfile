# Local-dev Dockerfile: runs Vite's dev server with HMR against the backend
# container. A separate production Dockerfile (multi-stage build -> static
# hosting or nginx) is Sprint 6 hardening work, not needed for local dev.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
