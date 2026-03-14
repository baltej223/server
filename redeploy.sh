cd ..
rm -rf ./src
git clone https://github.com/baltej223/server.git ./server

mv ./server/src ./src
rm -rf ./server

mv ./.env ./src/.env

cd ./src
npm i --force
sleep 10
npm start
