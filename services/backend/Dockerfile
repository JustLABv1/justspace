FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server/

FROM alpine:3.24

RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server .
COPY migrations/ ./migrations/
RUN mkdir -p /data/uploads

ENV PORT=8080
ENV MIGRATIONS_DIR=/app/migrations
ENV FILE_STORAGE_ROOT=/data/uploads

EXPOSE 8080
CMD ["./server"]
