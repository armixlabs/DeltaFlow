#!/usr/bin/env bash
# Smoke test for the Gemini API connection. Requires the environment
# variables from setenv.sh:  bash setenv.sh ./apitest.sh
curl "${GEMINI_API_BASE:?}/v1beta/models/${GEMINI_MODEL:?}:generateContent" \
  -H 'Content-Type: application/json' \
  -H "X-goog-api-key: ${GEMINI_API_KEY:?}" \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'
