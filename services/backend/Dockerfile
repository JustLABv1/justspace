FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server .

FROM alpine:3.24

RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server .
COPY migrations/ ./migrations/
RUN addgroup -S -g 10001 justspace \
    && adduser -S -u 10001 -G justspace justspace \
    && mkdir -p /data/uploads /tmp \
    && chown -R justspace:justspace /app /data/uploads /tmp

ENV PORT=8080
ENV MIGRATIONS_DIR=/app/migrations
ENV FILE_STORAGE_ROOT=/data/uploads

EXPOSE 8080
USER 10001:10001
CMD ["./server"]
