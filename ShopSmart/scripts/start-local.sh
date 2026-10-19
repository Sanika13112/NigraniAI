#!/usr/bin/env bash
# Starts every backend service locally with Maven (no Docker). Requires Java 17+ and MySQL
# reachable at DB_URL. Reads ./.env. Logs go to ./logs/<service>.log.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Create .env first (cp .env.example .env, then fill it in)"; exit 1; }
set -a; source .env; set +a
export DB_URL="${LOCAL_DB_URL:-jdbc:mysql://localhost:33006/shopsmart_db}"
export EUREKA_SERVER_URL=http://localhost:8761/eureka/
export CUSTOMER_SERVICE_URL=http://localhost:8081 PRODUCT_SERVICE_URL=http://localhost:8082 \
       ORDER_SERVICE_URL=http://localhost:8084 PAYMENT_SERVICE_URL=http://localhost:8085 \
       NOTIFICATION_SERVICE_URL=http://localhost:8086
mkdir -p logs
start() { (cd "backend/$1" && ./mvnw -q spring-boot:run > "../../logs/$1.log" 2>&1 &) ; echo "started $1"; }
start discoveryserver; sleep 20
for s in customerservice productservice authenticationservice notificationservice orderservice paymentservice analyticsservice; do start "$s"; done
sleep 25; start apigateway
echo "Gateway on http://localhost:8080 once all services register (watch logs/)."
echo "Frontend: cd frontend && npm install && npm run dev"
