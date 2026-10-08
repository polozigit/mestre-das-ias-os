#!/usr/bin/env bash
# gerar-zip.sh — empacota o template como empresa-os.zip (padrão da fábrica:
# zip vai pro Drive da turma; a IA do aluno descompacta em sistemas/empresa-os/).
# Uso: bash scripts/gerar-zip.sh   (de qualquer cwd)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$(dirname "$DIR")/empresa-os.zip"

rm -f "$DEST"
cd "$DIR"
zip -qr "$DEST" . \
  -x "node_modules/*" ".next/*" ".vercel/*" "out/*" "build/*" \
     "*/__pycache__/*" "__pycache__/*" "*.pyc" \
     ".pytest_cache/*" "*/.pytest_cache/*" \
     ".env*" "*.tsbuildinfo" "next-env.d.ts" ".DS_Store" "*/.DS_Store" \
     "supabase/.temp/*" "supabase/.branches/*"

echo "gerado: $DEST ($(du -h "$DEST" | cut -f1))"
unzip -l "$DEST" | tail -1
