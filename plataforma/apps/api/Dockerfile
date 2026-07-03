# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/motor-dian-siigo/package.json packages/motor-dian-siigo/
COPY apps/api/package.json apps/api/
RUN npm install
COPY prisma ./prisma
COPY packages/motor-dian-siigo ./packages/motor-dian-siigo
COPY apps/api ./apps/api
RUN npx prisma generate \
 && npm run build -w @auxiliar/motor-dian-siigo \
 && npm run build -w @auxiliar/api

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/motor-dian-siigo/dist ./node_modules/@auxiliar/motor-dian-siigo/dist
COPY --from=build /app/packages/motor-dian-siigo/package.json ./node_modules/@auxiliar/motor-dian-siigo/
COPY --from=build /app/apps/api/dist ./dist
COPY prisma ./prisma
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
