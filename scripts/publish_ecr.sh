#!/bin/bash
set -e
set -x

STAGE=$1
TAG=$2
LABEL=$3
PACKAGE=$4
PRIVATE_ECR=$5
REGION=$6
EEVERSION=$(jq -r .version ../packages/server-core/package.json)

if [ $PRIVATE_ECR == "true" ]
then
  aws ecr get-login-password --region $REGION | docker login -u AWS --password-stdin $ECR_URL
  aws ecr describe-repositories --repository-names $REPO_NAME-$PACKAGE --region $REGION || aws ecr create-repository --repository-name $REPO_NAME-$PACKAGE --region $REGION
  node ./scripts/prune_ecr_images.js --repoName $REPO_NAME-$PACKAGE --region $REGION
else
  aws ecr-public get-login-password --region us-east-1 | docker login -u AWS --password-stdin $ECR_URL
  aws ecr-public describe-repositories --repository-names $REPO_NAME-$PACKAGE --region us-east-1 || aws ecr-public create-repository --repository-name $REPO_NAME-$PACKAGE --region us-east-1
  node ./scripts/prune_ecr_images.js --repoName $REPO_NAME-$PACKAGE --region us-east-1 --public
fi

docker tag $LABEL-$PACKAGE $ECR_URL/$REPO_NAME-$PACKAGE:$EEVERSION-$TAG
docker tag $LABEL-$PACKAGE $ECR_URL/$REPO_NAME-$PACKAGE:latest_$STAGE
docker push $ECR_URL/$REPO_NAME-$PACKAGE:$EEVERSION-$TAG
docker push $ECR_URL/$REPO_NAME-$PACKAGE:latest_$STAGE