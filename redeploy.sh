rm -rf ./src
git clone https://github.com/baltej223/server.git ./server

mv ./server/src ./src
rm -rf ./server

cd ./src
npm i --force
npm start
