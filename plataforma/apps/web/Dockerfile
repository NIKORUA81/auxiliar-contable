# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/motor-dian-siigo/package.json packages/motor-dian-siigo/
COPY apps/web/package.json apps/web/
RUN npm install
COPY apps/web ./apps/web
RUN npm run build -w @auxiliar/web

# ---- runtime: nginx sirve el estático y hace proxy del /api ----
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
