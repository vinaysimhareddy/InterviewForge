#!/usr/bin/env bash
# ==============================================================================
# InterviewForge - Database Backup & Restore Script
# Supports MongoDB Atlas URIs and Local Docker MongoDB Instances
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
TARGET_DIR="${BACKUP_DIR}/interviewforge_backup_${TIMESTAMP}"
MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017}"
DB_NAME="${MONGODB_DB_NAME:-ai-mock-interview}"

ACTION="${1:-backup}"

usage() {
    echo "Usage: $0 [backup | restore <archive_path>]"
    echo ""
    echo "Commands:"
    echo "  backup               Dump MongoDB database to timestamped gzip archive"
    echo "  restore <archive>    Restore database from specified .tar.gz archive"
    echo ""
    echo "Environment Variables:"
    echo "  MONGODB_URI          MongoDB connection string (credentials are masked in logs)"
    echo "  MONGODB_DB_NAME      Database name (default: ai-mock-interview)"
    echo "  BACKUP_DIR           Directory to store backups (default: ./backups)"
    exit 1
}

# Redact credentials for safe logging
masked_uri=$(echo "$MONGO_URI" | sed -E 's/(mongodb(\+srv)?:\/\/[^:]+:)[^@]+(@.*)/\1*****\3/')

case "$ACTION" in
    backup)
        echo "[Backup] Starting backup for database '${DB_NAME}'..."
        echo "[Backup] Connecting to: ${masked_uri}"
        mkdir -p "${BACKUP_DIR}"

        # Execute mongodump with gzip compression
        mongodump --uri="${MONGO_URI}" --db="${DB_NAME}" --archive="${TARGET_DIR}.archive.gz" --gzip

        echo "[Backup] Backup completed successfully!"
        echo "[Backup] Archive created at: ${TARGET_DIR}.archive.gz"
        ls -lh "${TARGET_DIR}.archive.gz"
        ;;

    restore)
        ARCHIVE_PATH="${2:-}"
        if [ -z "${ARCHIVE_PATH}" ] || [ ! -f "${ARCHIVE_PATH}" ]; then
            echo "[Error] Please provide a valid archive path to restore."
            usage
        fi

        echo "[Restore] WARNING: Restoring will overwrite existing collections in '${DB_NAME}'!"
        echo "[Restore] Target Archive: ${ARCHIVE_PATH}"
        echo "[Restore] Connecting to: ${masked_uri}"
        read -p "Are you sure you want to proceed? (y/N): " CONFIRM
        if [ "${CONFIRM}" != "y" ] && [ "${CONFIRM}" != "Y" ]; then
            echo "[Restore] Restoration cancelled by user."
            exit 0
        fi

        # Execute mongorestore with drop flag to replace current contents cleanly
        mongorestore --uri="${MONGO_URI}" --nsInclude="${DB_NAME}.*" --archive="${ARCHIVE_PATH}" --gzip --drop

        echo "[Restore] Database '${DB_NAME}' restored successfully from ${ARCHIVE_PATH}."
        ;;

    *)
        usage
        ;;
esac

