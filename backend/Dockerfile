FROM golang:1.25-alpine AS builder
LABEL org.opencontainers.image.source = "https://github.com/JustLabV1/justspace"

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server/

FROM alpine:3.21
LABEL org.opencontainers.image.source = "https://github.com/JustLabV1/justspace"

RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server .
COPY migrations/ ./migrations/

ENV PORT=8080
ENV MIGRATIONS_DIR=/app/migrations

EXPOSE 8080
CMD ["./server"]
