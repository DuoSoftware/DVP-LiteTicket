/**
 * Created by Heshan.i on 8/8/2016.
 */
var format = require('stringformat');
var config = require('config');
var q = require('q');
var amqp = require('amqp');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

//var queueHost = format('amqp://{0}:{1}@{2}:{3}', config.RabbitMQ.user, config.RabbitMQ.password, config.RabbitMQ.ip, config.RabbitMQ.port);
var rabbitmqIp = [];
if(config.RabbitMQ.ip) {
    rabbitmqIp = config.RabbitMQ.ip.split(",");
}

var queueConnection = amqp.createConnection({
    host: rabbitmqIp,
    port: config.RabbitMQ.port,
    login: config.RabbitMQ.user,
    password: config.RabbitMQ.password,
    vhost: config.RabbitMQ.vhost,
    noDelay: true,
    heartbeat:10
},{
    reconnect: true,
    reconnectBackoffStrategy: 'linear',
    reconnectExponentialLimit: 120000,
    reconnectBackoffTime: 1000
});
queueConnection.on('ready', function () {

    logger.info("Conection with the queue is OK");

});

function PublishToQueue(sendObj, messageType){

    console.log("From: "+ sendObj.from +" :: To: "+ sendObj.to);
    try {
        if(sendObj && sendObj.to) {
            queueConnection.publish(messageType, sendObj, {
                contentType: 'application/json'
            });
        }
    }catch(exp){

        console.log(exp);
    }
}

function ReadDataFromTicket(ticket, pattern){
    var queryPath = pattern.slice(2, -1);
    var spQuery = queryPath.split(".");
    if(spQuery && spQuery.length > 1){
        var readValue = ticket;
        for(var i = 1; i < spQuery.length; i++){
            if(readValue || i === 1){
                if(Array.isArray(readValue)){
                    for(var t = 0; t < readValue.length; t++){
                        var rValue = readValue[t];
                        if(rValue){
                            readValue[t] = rValue[spQuery[i]];
                        }else{
                            readValue[t] = "";
                        }
                    }
                }else {
                    readValue = readValue[spQuery[i]];
                }
            }else{
                readValue = "";
                break;
            }
        }
        return readValue;
    }else{
        readValue = "";
        return readValue;
    }
}

function SendMessage(ticket, template, messageData, messageType, callback){
    try{
        var queryRegex = "\\${ticket([.]([A-Z]*[a-z]*)*)*}";
        var queryPattern = new RegExp(queryRegex);
        var sendObj = {
            "company": ticket.company,
            "tenant": ticket.tenant
        };

        var from = queryPattern.test(messageData.from)? ReadDataFromTicket(ticket, messageData.from) : messageData.from;
        var to =  queryPattern.test(messageData.to)? ReadDataFromTicket(ticket, messageData.to) : messageData.to;
        var subject = queryPattern.test(messageData.subject)? ReadDataFromTicket(ticket, messageData.subject) : messageData.subject;

        sendObj.from =  from? from : "";
        sendObj.to =  to? to : "";
        sendObj.subject = subject? subject : "";
        if(template){
            sendObj.template = template;
            sendObj.body = "";
            sendObj.Parameters = {};
            //if(emailData.Parameters) {
                var parameterCount = Object.keys(ticket).length;
                for (var i = 0; i < parameterCount; i++) {
                    var paramKey = Object.keys(ticket)[i];
                    var valueAt = ticket[paramKey];
                    if (valueAt) {
                        sendObj.Parameters[paramKey] = valueAt;
                    }
                }
            //}
        }else{
            sendObj.template = "";
            sendObj.body = messageData.body;
        }

        if(to && Array.isArray(to)){
            for(var h = 0; h < to.length; h++){
                sendObj.to =  to[h]? to[h] : "";
                PublishToQueue(sendObj, messageType);
            }
        }else{
            sendObj.to =  to? to : "";
            PublishToQueue(sendObj, messageType);
        }

        callback(true);
    }catch(ex){
        console.log("Generate Email Failed :: "+ ex);
        callback(false);
    }
}

function PublishToDashboard(messageType, sendObj){

    console.log("PublishToDashboard :: messageType: "+ messageType +" :: sendObj: "+ JSON.strigify(sendObj));
    try {
        if(messageType && sendObj) {
            queueConnection.publish(messageType, sendObj, {
                contentType: 'application/json'
            });
        }
    }catch(exp){

        console.log(exp);
    }
}

module.exports.SendMessage = SendMessage;
module.exports.PublishToDashboard = PublishToDashboard;