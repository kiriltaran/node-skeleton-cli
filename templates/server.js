const http = require('http');
const chalk = require('chalk');

const app = require('./app');

const { port, host, env } = require('./config');

const server = http.createServer(app);

server.listen(port, host, () => {
  global.console.log();
  global.console.log(
    `Server running on ${chalk.blue.underline(`http://${host}:${port}`)} in ${chalk.blue(
      env,
    )} environment`,
  );
});
