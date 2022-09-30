set -x

STAGE=$1
TAG=$2
EEVERSION=$(jq -r .version ../packages/server-core/package.json)

kubectl delete job $STAGE-xrengine-testbot

helm upgrade --reuse-values --set analytics.image.repository=$ECR_URL/$REPO_NAME-analytics,analytics.image.tag=$EEVERSION-$TAG,api.image.repository=$ECR_URL/$REPO_NAME-api,api.image.tag=$EEVERSION-$TAG,instanceserver.image.repository=$ECR_URL/$REPO_NAME-instanceserver,instanceserver.image.tag=$EEVERSION-$TAG,testbot.image.repository=$ECR_URL/$REPO_NAME-testbot,testbot.image.tag=$EEVERSION-$TAG,client.image.repository=$ECR_URL/$REPO_NAME-client,client.image.tag=$EEVERSION-$TAG $STAGE xrengine/xrengine
