# ── Stage 1: build frontend ───────────────────────────────────────────────────
FROM node:22-alpine AS build-frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN VITE_APP_MODE=hosted npm run build

# ── Stage 2: build backend ────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build-backend
WORKDIR /src
COPY backend/ParliamentApi.csproj ./
RUN dotnet restore
COPY backend/ .
RUN dotnet publish -c Release -o /app/publish

# ── Stage 3: runtime image ────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app

COPY --from=build-backend /app/publish .
# React build goes into wwwroot so ASP.NET serves it as static files
COPY --from=build-frontend /app/dist ./wwwroot

VOLUME ["/data"]
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "ParliamentApi.dll"]
