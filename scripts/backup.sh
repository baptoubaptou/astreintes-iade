#!/usr/bin/env bash
# Sauvegarde horodatée de la base SQLite Astreintes IADE.
#
# Usage :
#   ./scripts/backup.sh
#   RETENTION_DAYS=14 ./scripts/backup.sh
#   DB_PATH=./data/dev.db BACKUP_DIR=./backups ./scripts/backup.sh
#
# Variables d'environnement (optionnelles) :
#   DB_PATH        Chemin vers la base SQLite (prioritaire si défini)
#   DATABASE_URL   URL Prisma SQLite (ex. file:./dev.db) — lue depuis .env si absente
#   BACKUP_DIR     Dossier des sauvegardes (défaut : <projet>/backups)
#   LOG_FILE       Fichier de log (défaut : <BACKUP_DIR>/backup.log)
#   RETENTION_DAYS Nombre de jours de rétention (défaut : 30)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PRISMA_DIR="${PROJECT_ROOT}/prisma"
ENV_FILE="${PROJECT_ROOT}/.env"

BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
LOG_FILE="${LOG_FILE:-${BACKUP_DIR}/backup.log}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

log() {
  local level="$1"
  local message="$2"
  mkdir -p "$(dirname "${LOG_FILE}")"
  printf '[%s] [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${level}" "${message}" >> "${LOG_FILE}"
}

load_database_url_from_env_file() {
  if [[ -n "${DATABASE_URL:-}" ]] || [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi

  local line
  line="$(grep -E '^[[:space:]]*DATABASE_URL=' "${ENV_FILE}" | tail -n1 || true)"
  if [[ -z "${line}" ]]; then
    return 0
  fi

  DATABASE_URL="${line#DATABASE_URL=}"
  DATABASE_URL="${DATABASE_URL%$'\r'}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\'}"
  DATABASE_URL="${DATABASE_URL%\'}"
}

resolve_db_path_from_database_url() {
  local database_url="$1"

  if [[ "${database_url}" != file:* ]]; then
    log "ERREUR" "DATABASE_URL non supportée pour la sauvegarde : ${database_url}"
    exit 1
  fi

  local file_path="${database_url#file:}"

  if [[ "${file_path}" = /* ]]; then
    printf '%s\n' "${file_path}"
    return 0
  fi

  local relative_path="${file_path#./}"
  printf '%s\n' "${PRISMA_DIR}/${relative_path}"
}

resolve_db_path() {
  if [[ -n "${DB_PATH:-}" ]]; then
    printf '%s\n' "${DB_PATH}"
    return 0
  fi

  load_database_url_from_env_file

  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "ERREUR" "DB_PATH non défini et DATABASE_URL introuvable (.env ou environnement)."
    exit 1
  fi

  resolve_db_path_from_database_url "${DATABASE_URL}"
}

prune_old_backups() {
  local deleted_count=0

  while IFS= read -r -d '' old_backup; do
    rm -f "${old_backup}"
    deleted_count=$((deleted_count + 1))
    log "INFO" "Sauvegarde obsolète supprimée : $(basename "${old_backup}")"
  done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'astreintes-*.db' -mtime +"${RETENTION_DAYS}" -print0)

  log "INFO" "Rétention : ${RETENTION_DAYS} jour(s), ${deleted_count} sauvegarde(s) supprimée(s)."
}

main() {
  mkdir -p "${BACKUP_DIR}"

  DB_PATH="$(resolve_db_path)"

  if [[ ! -f "${DB_PATH}" ]]; then
    log "ERREUR" "Base SQLite introuvable : ${DB_PATH}"
    exit 1
  fi

  local timestamp backup_file
  timestamp="$(date '+%Y-%m-%d-%H%M')"
  backup_file="${BACKUP_DIR}/astreintes-${timestamp}.db"

  if command -v sqlite3 >/dev/null 2>&1; then
    if sqlite3 "${DB_PATH}" ".backup '${backup_file}'"; then
      log "SUCCÈS" "Sauvegarde créée (sqlite3) : ${backup_file} (source : ${DB_PATH})"
    else
      log "ERREUR" "Échec de la sauvegarde sqlite3 pour ${DB_PATH}"
      exit 1
    fi
  else
    log "INFO" "sqlite3 indisponible, copie fichier brute (arrêter le conteneur pour une sauvegarde à chaud plus sûre)."
    if cp "${DB_PATH}" "${backup_file}"; then
      log "SUCCÈS" "Sauvegarde créée (cp) : ${backup_file} (source : ${DB_PATH})"
    else
      log "ERREUR" "Échec de la copie pour ${DB_PATH}"
      exit 1
    fi
  fi

  prune_old_backups
}

main "$@"
