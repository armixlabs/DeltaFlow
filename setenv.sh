#!/usr/bin/env bash
#
# Sets all environment variables Deltaflow needs (ADONIS repository and the
# Gemini / OpenAI / Anthropic API connections). The values are read from
# configparam.txt, so no credentials live in the code. The file is looked up
# next to this script first, then one directory above it (outside the repository).
#
# Usage:
#   source ./setenv.sh              # set the variables in the current shell
#   bash setenv.sh npm run dev      # run a single command with the variables set
#
# A different parameter file can be selected with DELTAFLOW_CONFIG=/path/to/file.
# Works in bash and zsh.

DELTAFLOW_REQUIRED_VARS="
ADO_REST_HOST
ADO_REST_IDENTIFIER
ADO_REST_SECRET
ADO_REST_REPO
ADO_REST_ROOTMODELGROUP
GEMINI_API_BASE
GEMINI_API_KEY
GEMINI_MODEL
OPENAI_API_BASE
OPENAI_API_KEY
OPENAI_MODEL
ANTHROPIC_API_BASE
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
ANTHROPIC_HAIKU_MODEL
ANTHROPIC_VERSION
"

_deltaflow_setenv() {
  local script_path script_dir config_file line key value missing="" count=0

  if [ -n "${ZSH_VERSION:-}" ]; then
    eval 'script_path="${(%):-%x}"'
  else
    script_path="${BASH_SOURCE[0]}"
  fi
  script_dir="$(cd "$(dirname "$script_path")" && pwd)"
  if [ -n "${DELTAFLOW_CONFIG:-}" ]; then
    config_file="$DELTAFLOW_CONFIG"
  elif [ -r "$script_dir/configparam.txt" ]; then
    config_file="$script_dir/configparam.txt"
  else
    config_file="$(dirname "$script_dir")/configparam.txt"
  fi

  if [ ! -r "$config_file" ]; then
    echo "setenv.sh: parameter file not found: $config_file" >&2
    return 1
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      '' | \#*) continue ;;
      *=*) ;;
      *)
        echo "setenv.sh: ignoring line without '=': $line" >&2
        continue
        ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      '' | [0-9]* | *[!A-Za-z0-9_]*)
        echo "setenv.sh: ignoring invalid variable name: $key" >&2
        continue
        ;;
    esac
    export "$key=$value"
    count=$((count + 1))
  done < "$config_file"

  for key in $(echo $DELTAFLOW_REQUIRED_VARS); do
    eval "value=\"\${$key:-}\""
    [ -n "$value" ] || missing="$missing $key"
  done

  # Missing values only disable the affected connection (see vite.config.ts), so warn instead of failing.
  if [ -n "$missing" ]; then
    echo "setenv.sh: warning: missing or empty in $config_file:$missing" >&2
    echo "           the affected connections stay disabled" >&2
  fi

  echo "setenv.sh: $count variables set from $config_file" >&2
}

_deltaflow_sourced=0
if [ -n "${ZSH_VERSION:-}" ]; then
  case "${ZSH_EVAL_CONTEXT:-}" in *:file*) _deltaflow_sourced=1 ;; esac
elif [ "${BASH_SOURCE[0]}" != "$0" ]; then
  _deltaflow_sourced=1
fi

_deltaflow_setenv
_deltaflow_status=$?
unset -f _deltaflow_setenv
unset DELTAFLOW_REQUIRED_VARS

if [ "$_deltaflow_sourced" -eq 1 ]; then
  unset _deltaflow_sourced
  return "$_deltaflow_status"
fi

[ "$_deltaflow_status" -eq 0 ] || exit "$_deltaflow_status"

if [ "$#" -eq 0 ]; then
  echo "setenv.sh: run 'source ./setenv.sh' to keep the variables in your shell," >&2
  echo "           or pass a command to run with them: bash setenv.sh npm run dev" >&2
  exit 2
fi

exec "$@"
