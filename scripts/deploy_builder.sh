set -e
set -x

STAGE=$1
TAG=$2
EEVERSION=$(jq -r .version ../packages/server-core/package.json)

helm upgrade --install --reuse-values --set builder.image.tag=$EEVERSION-$TAG $STAGE-builder xrengine/xrengine-builder
