echo "BUILDING"
docker-compose build

echo "TAGGING"
docker tag flowstream_web totalplatform/flowstream:latest

echo "PUSHING"
docker push totalplatform/flowstream:latest

echo "DONE"