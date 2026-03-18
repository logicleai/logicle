#!/bin/bash
diff <(jq -r 'paths | map(tostring) | join(".")' locales/en/logicle.json) <(jq -r 'paths | map(tostring) | join(".")' locales/it/logicle.json)
