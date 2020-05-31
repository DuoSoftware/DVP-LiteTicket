var format = require('stringformat');
var config = require('config');
var q = require('q');
var amqp = require('amqp');
var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;

//var queueHost = format('amqp://{0}:{1}@{2}:{3}', config.RabbitMQ.user, config.RabbitMQ.password, config.RabbitMQ.ip, config.RabbitMQ.port);
var rabbitmqIP = [];
if(config.RabbitMQ.ip) {
    rabbitmqIP = config.RabbitMQ.ip.split(",");
}

var queueConnection = amqp.createConnection({
    host: rabbitmqIP,
    port: config.RabbitMQ.port,
    login: config.RabbitMQ.user,
    password: config.RabbitMQ.password,
    vhost: config.RabbitMQ.vhost,
    noDelay: true,
    heartbeat:10
}, {
    reconnect: true,
    reconnectBackoffStrategy: 'linear',
    reconnectExponentialLimit: 120000,
    reconnectBackoffTime: 1000
});
queueConnection.on('ready', function () {

    logger.info("Conection with the queue is OK");

});

queueConnection.on('error', function (error) {

    logger.error("Issue in amqp ", error);

});

module.exports.queueConnection = queueConnection;
