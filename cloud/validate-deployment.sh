#!/usr/bin/env bash
# =============================================================================
# SCENSUS Cloud Deployment Validator
# =============================================================================
# Validates that a cloud deployment is ready by checking environment variables,
# TLS certificates, Docker services, database connectivity, API health, and
# Redis availability.
#
# Usage:
#   ./cloud/validate-deployment.sh
#
# Exit codes:
#   0 - All critical checks passed
#   1 - One or more critical checks failed
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${SCRIPT_DIR}/certs"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

REQUIRED_ENV_VARS=("POSTGRES_PASSWORD" "HMAC_SECRET" "JWT_SECRET")
REQUIRED_CERTS=("fullchain.pem" "privkey.pem")
REQUIRED_SERVICES=("api" "postgres" "redis" "nginx" "worker")

# Health endpoint served by nginx on the host
API_HEALTH_URL="https://localhost:${HTTPS_PORT:-443}/api/v2/health"

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    GREEN=''
    RED=''
    YELLOW=''
    BOLD=''
    RESET=''
fi

pass()  { PASS_COUNT=$((PASS_COUNT + 1));  printf "  ${GREEN}[PASS]${RESET}  %s\n" "$1"; }
fail()  { FAIL_COUNT=$((FAIL_COUNT + 1));  printf "  ${RED}[FAIL]${RESET}  %s\n" "$1"; }
warn()  { WARN_COUNT=$((WARN_COUNT + 1));  printf "  ${YELLOW}[WARN]${RESET}  %s\n" "$1"; }
header(){ printf "\n${BOLD}== %s ==${RESET}\n" "$1"; }

# ---------------------------------------------------------------------------
# Load .env if present (so the script can read POSTGRES_PASSWORD, etc.)
# ---------------------------------------------------------------------------
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
    # Export every non-comment, non-empty line
    set -a
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/.env"
    set +a
fi

# ---------------------------------------------------------------------------
# 1. Required environment variables
# ---------------------------------------------------------------------------
header "Environment Variables"

for var in "${REQUIRED_ENV_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        fail "${var} is not set"
    else
        # Warn on short secrets
        val="${!var}"
        if [[ "${#val}" -lt 32 && "${var}" != "POSTGRES_PASSWORD" ]]; then
            warn "${var} is set but shorter than 32 characters (${#val} chars)"
        else
            pass "${var} is set"
        fi
    fi
done

# ---------------------------------------------------------------------------
# 2. TLS certificates
# ---------------------------------------------------------------------------
header "TLS Certificates"

for cert in "${REQUIRED_CERTS[@]}"; do
    cert_path="${CERTS_DIR}/${cert}"
    if [[ ! -f "${cert_path}" ]]; then
        fail "${cert} not found in ${CERTS_DIR}/"
    elif [[ ! -s "${cert_path}" ]]; then
        fail "${cert} exists but is empty"
    else
        pass "${cert} exists"

        # Additional: check certificate expiry if openssl is available
        if [[ "${cert}" == "fullchain.pem" ]] && command -v openssl &>/dev/null; then
            expiry_date=$(openssl x509 -enddate -noout -in "${cert_path}" 2>/dev/null | cut -d= -f2)
            if [[ -n "${expiry_date}" ]]; then
                expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "${expiry_date}" +%s 2>/dev/null \
                               || date -d "${expiry_date}" +%s 2>/dev/null \
                               || echo "")
                now_epoch=$(date +%s)
                if [[ -n "${expiry_epoch}" ]]; then
                    days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
                    if (( days_left < 0 )); then
                        fail "TLS certificate expired ${days_left#-} days ago"
                    elif (( days_left < 30 )); then
                        warn "TLS certificate expires in ${days_left} days (${expiry_date})"
                    else
                        pass "TLS certificate valid for ${days_left} days"
                    fi
                fi
            fi
        fi
    fi
done

# ---------------------------------------------------------------------------
# 3. Docker services
# ---------------------------------------------------------------------------
header "Docker Services"

if ! command -v docker &>/dev/null; then
    fail "docker CLI not found in PATH"
else
    # Determine the compose command available
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        fail "Neither 'docker compose' nor 'docker-compose' is available"
        COMPOSE_CMD=""
    fi

    if [[ -n "${COMPOSE_CMD}" ]]; then
        for svc in "${REQUIRED_SERVICES[@]}"; do
            # Get the container status via docker compose
            status=$(${COMPOSE_CMD} -f "${COMPOSE_FILE}" ps --format json "${svc}" 2>/dev/null \
                     | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('State','') if isinstance(data,dict) else '')" 2>/dev/null \
                     || echo "")

            if [[ -z "${status}" ]]; then
                # Fallback: try plain text output
                status=$(${COMPOSE_CMD} -f "${COMPOSE_FILE}" ps "${svc}" 2>/dev/null | tail -n +2 | awk '{print $NF}' || echo "")
            fi

            if [[ -z "${status}" ]]; then
                fail "Service '${svc}' not found or not created"
            elif [[ "${status}" =~ [Rr]unning|[Uu]p ]]; then
                pass "Service '${svc}' is running"
            else
                fail "Service '${svc}' status: ${status}"
            fi
        done
    fi
fi

# ---------------------------------------------------------------------------
# 4. Database reachable & migrations applied
# ---------------------------------------------------------------------------
header "Database"

if [[ -n "${COMPOSE_CMD:-}" ]]; then
    # Check postgres is accepting connections
    db_ready=$(${COMPOSE_CMD} -f "${COMPOSE_FILE}" exec -T postgres \
        pg_isready -U scensus -d scensus 2>/dev/null || echo "")
    if [[ "${db_ready}" == *"accepting connections"* ]]; then
        pass "PostgreSQL is accepting connections"
    else
        fail "PostgreSQL is not reachable"
    fi

    # Check Alembic migration status
    # Run 'alembic current' inside the api container where alembic is installed
    migration_output=$(${COMPOSE_CMD} -f "${COMPOSE_FILE}" exec -T api \
        python -m alembic current 2>/dev/null || echo "")
    if [[ -z "${migration_output}" ]]; then
        fail "Could not determine migration status (alembic current failed)"
    elif [[ "${migration_output}" == *"(head)"* ]]; then
        # Extract the current revision for display
        current_rev=$(echo "${migration_output}" | grep "(head)" | awk '{print $1}')
        pass "Migrations are up to date (head: ${current_rev})"
    else
        warn "Migrations may not be at head: ${migration_output}"
    fi
else
    fail "Cannot check database (docker compose unavailable)"
fi

# ---------------------------------------------------------------------------
# 5. API health endpoint
# ---------------------------------------------------------------------------
header "API Health"

if command -v curl &>/dev/null; then
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "${API_HEALTH_URL}" 2>/dev/null || echo "000")
    if [[ "${http_code}" == "200" ]]; then
        pass "GET /api/v2/health returned HTTP 200"
    elif [[ "${http_code}" == "000" ]]; then
        fail "API health endpoint unreachable (connection refused or timeout)"
    else
        fail "GET /api/v2/health returned HTTP ${http_code}"
    fi
else
    warn "curl not found; skipping API health check"
fi

# ---------------------------------------------------------------------------
# 6. Redis reachable
# ---------------------------------------------------------------------------
header "Redis"

if [[ -n "${COMPOSE_CMD:-}" ]]; then
    redis_pong=$(${COMPOSE_CMD} -f "${COMPOSE_FILE}" exec -T redis \
        redis-cli ping 2>/dev/null || echo "")
    if [[ "${redis_pong}" == *"PONG"* ]]; then
        pass "Redis is reachable (PONG)"
    else
        fail "Redis did not respond to PING"
    fi
else
    fail "Cannot check Redis (docker compose unavailable)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf "\n${BOLD}== Summary ==${RESET}\n"
printf "  ${GREEN}Passed: ${PASS_COUNT}${RESET}  "
printf "${RED}Failed: ${FAIL_COUNT}${RESET}  "
printf "${YELLOW}Warnings: ${WARN_COUNT}${RESET}\n\n"

if (( FAIL_COUNT > 0 )); then
    printf "${RED}${BOLD}Deployment validation FAILED.${RESET} Fix the issues above before going live.\n"
    exit 1
else
    if (( WARN_COUNT > 0 )); then
        printf "${YELLOW}${BOLD}Deployment validation PASSED with warnings.${RESET} Review items above.\n"
    else
        printf "${GREEN}${BOLD}Deployment validation PASSED.${RESET} All checks green.\n"
    fi
    exit 0
fi
