# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Ruby application
FROM ruby:4.0-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY config.ru ./
COPY --from=frontend-build /app/public ./public

EXPOSE 9292

CMD ["bundle", "exec", "falcon", "serve", "--bind", "http://0.0.0.0:9292"]
