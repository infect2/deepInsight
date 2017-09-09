# Fully-fledged Web Application Scaldfolding
## Node, Mongo, Express, Handlebars
## Loging
## email
## RabbitMQ

## Docker Build
docker build -t deepinsight

## Prequite for Running Deepinsight
### Mongo DB
docker-compose -f mongo-compose.yaml up -d

### Fluentd/ElasticSearch/Kibana
docker-compose -f logging-compose.yaml up -d

please refer to https://docs.fluentd.org/v0.12/articles/docker-logging-efk-compose for detailed instructions

## Running DeepInsight
### Docker Run in Devlopment Mode (Single Process with Node Inspect On)
docker run -e "ENV=DEV" -p 49160:3000 -p 49161:9229 deepinsight

docker-compose -f deepinsight-compose.yaml up -d

### Docker Run in Production Mode (Cluster Mode)
docker run -p 49160:3000 deepinsight
