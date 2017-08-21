# Online Survey Platform
Coming Soon
2017-08-13

# Docker Build
docker build -t sangseoklim/deepinsight
# Docker Run in Devlopment Mode (Single Process with Node Inspect On)
docker run -e "ENV=DEV" -p 49160:3000 -p 49161:9229 sangseoklim/deepinsight

#Docker Run in Production Mode (Cluster Mode)
docker run -p 49160:3000 sangseoklim/deepinsight