#!/bin/sh
# Puts edge/worker.mjs on punto.example.com (DEPLOY.md): uploads the Worker with its bindings, makes the
# proxied DNS record (AAAA 100::, the address Cloudflare uses for a name only a Worker answers) and
# the route. Safe to run again. Needs ~/code/cloudflare-keys/config.env and the edge secret.
#   sh edge/deploy.sh punto-xxxx.europe-west1.run.app
set -eu
ORIGIN=$1
NAME=punto.example.com
SCRIPT=punto-edge
set -a; . "$HOME/code/cloudflare-keys/config.env"; set +a
SECRET=$(cat "$HOME/code/meta-keys/punto-edge-secret.txt")
API=https://api.cloudflare.com/client/v4
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
ok() { python3 -c "import json,sys;j=json.load(sys.stdin);print('$1', j['success'], [e.get('message') for e in j.get('errors',[])])"; }

DIR=$(dirname "$0")
META=$(python3 -c "import json,sys;print(json.dumps({'main_module':'worker.mjs','compatibility_date':'2026-11-01','bindings':[{'type':'plain_text','name':'ORIGIN','text':sys.argv[1]},{'type':'secret_text','name':'EDGE_SECRET','text':sys.argv[2]}]}))" "$ORIGIN" "$SECRET")
curl -s -X PUT "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$SCRIPT" -H "$AUTH" \
  -F "metadata=$META;type=application/json" \
  -F "worker.mjs=@$DIR/worker.mjs;type=application/javascript+module" | ok worker

ZONE=$(curl -s "$API/zones?name=example.com" -H "$AUTH" | python3 -c "import json,sys;print(json.load(sys.stdin)['result'][0]['id'])")
if [ "$(curl -s "$API/zones/$ZONE/dns_records?name=$NAME" -H "$AUTH" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['result']))")" = 0 ]; then
  curl -s -X POST "$API/zones/$ZONE/dns_records" -H "$AUTH" -H 'content-type: application/json' \
    --data "{\"type\":\"AAAA\",\"name\":\"$NAME\",\"content\":\"100::\",\"proxied\":true,\"comment\":\"Punto: Worker $SCRIPT -> Cloud Run\"}" | ok dns
fi
if [ "$(curl -s "$API/zones/$ZONE/workers/routes" -H "$AUTH" | python3 -c "import json,sys;print(sum(r['pattern']=='$NAME/*' for r in json.load(sys.stdin)['result']))")" = 0 ]; then
  curl -s -X POST "$API/zones/$ZONE/workers/routes" -H "$AUTH" -H 'content-type: application/json' \
    --data "{\"pattern\":\"$NAME/*\",\"script\":\"$SCRIPT\"}" | ok route
fi
