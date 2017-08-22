# Online Survey Platform
Coming Soon
2017-08-13

## Docker Build
docker build -t deepinsight

## Prequite for Running Deepinsight
### Mongo DB
docker-compose -f mongo-compose.yaml up -d

### Fluentd
docker-compose -f fluentd-compose.yaml up -d

## Running DeepInsight
### Docker Run in Devlopment Mode (Single Process with Node Inspect On)
docker run -e "ENV=DEV" -p 49160:3000 -p 49161:9229 deepinsight

docker-compose -f deepinsight-compose.yaml up -d

### Docker Run in Production Mode (Cluster Mode)
docker run -p 49160:3000 deepinsight
